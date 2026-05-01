import asyncio
from datetime import datetime, timezone
from typing import List

import httpx
from fastapi import APIRouter, HTTPException, Request
from app.config import settings
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.models.schemas import (
    MultiRouteWeatherResponse,
    RouteInfo,
    RouteWeatherRequest,
    RouteWeatherResponse,
    Waypoint,
)
from app.services.maps_service import (
    cumulative_distances,
    decode_route,
    get_route,
    sample_waypoints,
)
from app.services.weather_service import (
    get_weather_for_waypoints,
    xweather_exhausted,
    meteoblue_exhausted,
    tomorrow_exhausted,
    open_meteo_exhausted,
)
from app.services.met_malaysia_service import get_active_warnings

router = APIRouter(prefix="/api", tags=["weather-route"])
limiter = Limiter(key_func=get_remote_address)

_SEVERITY = {"green": 0, "yellow": 1, "red": 3}


@router.get("/provider-status", tags=["meta"])
async def provider_status():
    """Return which weather provider is currently active and exhaustion flags."""
    import app.services.weather_service as ws
    if not ws.xweather_exhausted:
        primary = "xweather"
    elif not ws.meteoblue_exhausted:
        primary = "meteoblue"
    elif not ws.tomorrow_exhausted:
        primary = "tomorrow.io"
    elif not ws.open_meteo_exhausted:
        primary = "open-meteo"
    else:
        primary = "weatherapi"
    return {
        "primary": primary,
        "xweather_exhausted":   ws.xweather_exhausted,
        "meteoblue_exhausted":  ws.meteoblue_exhausted,
        "tomorrow_exhausted":   ws.tomorrow_exhausted,
        "open_meteo_exhausted": ws.open_meteo_exhausted,
    }


@router.get("/debug-weather")
async def debug_weather(lat: float = 3.1390, lon: float = 101.6869):
    """
    Test WeatherAPI.com response for a coordinate.
    GET /api/debug-weather?lat=3.139&lon=101.6869
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            "https://api.weatherapi.com/v1/current.json",
            params={"key": settings.weatherapi_key, "q": f"{lat},{lon}", "aqi": "no"},
        )
    try:
        return {"status_code": resp.status_code, "body": resp.json()}
    except Exception:
        return {"status_code": resp.status_code, "body": resp.text[:500]}


def _overall(waypoints_data: List[dict]) -> tuple[str, str, str, List[str]]:
    """Derive overall trip status, label, summary, and alert messages."""
    statuses = [wp["weather"].status for wp in waypoints_data]
    alerts: List[str] = []

    if "red" in statuses:
        status = "red"
        label = "Not Safe to Ride"
        n = statuses.count("red")
        alerts.append(
            f"⚠️ {n} section{'s' if n > 1 else ''} with dangerous weather "
            "(rain / thunderstorm). Consider postponing."
        )
    elif "yellow" in statuses:
        status = "yellow"
        label = "Ride with Caution"
        n = statuses.count("yellow")
        alerts.append(
            f"🌥️ {n} section{'s' if n > 1 else ''} with cloudy / light rain conditions. "
            "Stay alert and bring rain gear."
        )
    else:
        status = "green"
        label = "Safe to Ride"

    bad = [wp for wp in waypoints_data if wp["weather"].status != "green"]
    if not bad:
        summary = "The entire route looks clear. Great time to ride! 🏍️"
    else:
        names = [wp["label"] for wp in bad[:3]]
        extra = f" and {len(bad) - 3} more" if len(bad) > 3 else ""
        summary = f"Watch out near: {', '.join(names)}{extra}."

    return status, label, summary, alerts


def _weather_score(waypoints_data: List[dict]) -> float:
    """Lower is better (drier). green=0, yellow=1, red=3 per waypoint."""
    return sum(_SEVERITY.get(wp["weather"].status, 0) for wp in waypoints_data)


def _format_met_warnings(raw_warnings: list) -> List[str]:
    out = []
    for w in raw_warnings:
        heading = w.get("heading", "").strip()
        text    = w.get("text", "").strip()
        title   = w.get("title", "").strip()
        until   = w.get("valid_until", "")
        parts = []
        if title:
            parts.append(title)
        if heading and heading != title:
            parts.append(heading)
        if text:
            parts.append(text)
        if until:
            try:
                from datetime import datetime as _dt, timedelta as _td
                dt = _dt.fromisoformat(until.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                myt = dt + _td(hours=8)
                parts.append(f"(valid until {myt.strftime('%d %b, %H:%M')} MYT)")
            except Exception:
                pass
        if parts:
            out.append(" — ".join(parts))
    return out


async def _build_route_response(
    route_data: dict,
    departure: datetime,
    now: datetime,
    route_index: int,
    met_warnings: List[str],
) -> RouteWeatherResponse:
    """Process a single raw route → full RouteWeatherResponse."""
    coords   = decode_route(route_data["encoded_polyline"])
    cum_dist = cumulative_distances(coords)
    n_points = min(7, max(3, len(coords) // 50 + 3))
    sampled  = sample_waypoints(
        coords=coords,
        cum_dist=cum_dist,
        total_duration_s=route_data["duration_seconds"],
        departure_time=departure,
        num_points=n_points,
    )

    # Mark start + destination for real-time fetch (not forecast)
    if sampled:
        sampled[0]["realtime"]  = True
        sampled[-1]["realtime"] = True

    # Weather conditions for all waypoints
    conditions = await get_weather_for_waypoints(sampled)
    for wp, cond in zip(sampled, conditions):
        wp["weather"] = cond

    overall_status, overall_label, summary, alerts = _overall(sampled)
    score = _weather_score(sampled)

    return RouteWeatherResponse(
        route_index=route_index,
        route_label="",
        is_recommended=False,
        weather_score=score,
        route=RouteInfo(
            total_distance_km=round(route_data["distance_meters"] / 1000, 1),
            total_duration_minutes=round(route_data["duration_seconds"] / 60),
            encoded_polyline=route_data["encoded_polyline"],
        ),
        waypoints=[
            Waypoint(
                index=wp["index"],
                lat=wp["lat"],
                lng=wp["lng"],
                label=wp["label"],
                eta=wp["eta"],
                distance_from_start_km=wp["distance_from_start_km"],
                weather=wp["weather"],
            )
            for wp in sampled
        ],
        overall_status=overall_status,
        overall_label=overall_label,
        summary=summary,
        alerts=alerts,
        met_warnings=met_warnings,
        departure_time=departure,
        last_updated=now,
    )


@router.post("/route-weather", response_model=MultiRouteWeatherResponse)
@limiter.limit("30/minute")
async def get_route_weather(request: Request, body: RouteWeatherRequest):
    """
    Return weather conditions for all available routes (1-3).
    Routes are ranked by weather score (driest first = recommended).
    """
    now = datetime.now(timezone.utc)
    departure = body.departure_time or now
    if departure.tzinfo is None:
        departure = departure.replace(tzinfo=timezone.utc)

    # ── 1. Fetch routes + MET warnings concurrently ──────────────────────────
    try:
        all_route_data, met_raw = await asyncio.gather(
            get_route(body.origin, body.destination),
            get_active_warnings(),
            return_exceptions=False,
        )
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Google Routes API returned {exc.response.status_code}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to fetch route data.")

    met_warnings = _format_met_warnings(met_raw or [])

    # ── 2. Process each route concurrently ──────────────────────────────────
    try:
        responses: List[RouteWeatherResponse] = list(await asyncio.gather(*[
            _build_route_response(rd, departure, now, idx, met_warnings)
            for idx, rd in enumerate(all_route_data)
        ]))
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to fetch weather data.")

    # ── 3. Rank by weather score (driest first) ─────────────────────────────
    responses.sort(key=lambda r: (r.weather_score, r.route.total_duration_minutes))

    fastest_idx = min(range(len(all_route_data)),
                      key=lambda i: all_route_data[i]["duration_seconds"])

    for rank, resp in enumerate(responses):
        is_fastest = (resp.route_index == fastest_idx)
        is_driest  = (rank == 0)

        if (is_fastest and is_driest) or len(responses) == 1:
            label = "Recommended"
        elif is_driest:
            label = "Driest Route"
        elif is_fastest:
            label = "Fastest Route"
        else:
            label = f"Alternative {rank + 1}"

        responses[rank] = resp.model_copy(update={
            "route_label":    label,
            "is_recommended": (rank == 0),
        })

    return MultiRouteWeatherResponse(
        routes=responses,
        recommended_index=0,
    )
