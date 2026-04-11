import logging
import math
from datetime import datetime, timedelta
from typing import List, Optional, Tuple

import httpx
import polyline as poly_lib

from app.config import settings

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return distance in metres between two WGS-84 coordinates."""
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def cumulative_distances(coords: List[Tuple[float, float]]) -> List[float]:
    """Return cumulative distance in metres at each coordinate index."""
    dist = [0.0]
    for i in range(1, len(coords)):
        d = haversine(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1])
        dist.append(dist[-1] + d)
    return dist


# ---------------------------------------------------------------------------
# Waypoint sampler
# ---------------------------------------------------------------------------

def sample_waypoints(
    coords: List[Tuple[float, float]],
    cum_dist: List[float],
    total_duration_s: int,
    departure_time: datetime,
    num_points: int = 7,
) -> List[dict]:
    """
    Return *num_points* evenly-spaced waypoints (including start & end)
    with estimated ETAs based on proportional travel time.
    """
    total_dist = cum_dist[-1]
    if total_dist == 0:
        return []

    indices: List[int] = [0]
    if num_points > 2:
        for i in range(1, num_points - 1):
            target = total_dist * i / (num_points - 1)
            closest = min(range(len(cum_dist)), key=lambda j: abs(cum_dist[j] - target))
            indices.append(closest)
    indices.append(len(coords) - 1)

    waypoints = []
    for rank, idx in enumerate(indices):
        lat, lng = coords[idx]
        dist_m = cum_dist[idx]
        ratio = dist_m / total_dist
        eta = departure_time + timedelta(seconds=int(ratio * total_duration_s))

        if rank == 0:
            label = "Start"
        elif rank == len(indices) - 1:
            label = "Destination"
        else:
            label = f"{dist_m / 1000:.0f} km"

        waypoints.append(
            {
                "index": rank,
                "lat": round(lat, 6),
                "lng": round(lng, 6),
                "label": label,
                "eta": eta,
                "distance_from_start_km": round(dist_m / 1000, 1),
            }
        )

    return waypoints


# ---------------------------------------------------------------------------
# Google Routes API v2
# ---------------------------------------------------------------------------

async def get_route(origin: str, destination: str) -> list[dict]:
    """
    Call Google Routes API v2 and return a list of route dicts (1-3 routes).
    Each dict has: distance_meters, duration_seconds, encoded_polyline.
    First element is always the primary route.
    """
    url = "https://routes.googleapis.com/directions/v2:computeRoutes"
    headers = {
        "X-Goog-Api-Key": settings.google_maps_api_key,
        "X-Goog-FieldMask": (
            "routes.duration,"
            "routes.distanceMeters,"
            "routes.polyline.encodedPolyline"
        ),
        "Content-Type": "application/json",
    }
    body = {
        "origin": {"address": origin},
        "destination": {"address": destination},
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE",
        "computeAlternativeRoutes": True,
        "languageCode": "en-US",
        "units": "METRIC",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    if not data.get("routes"):
        raise ValueError("No route found between the given locations.")

    results = []
    for route in data["routes"]:
        raw_duration = route.get("duration", "0s")
        duration_s = int(str(raw_duration).rstrip("s"))
        results.append({
            "distance_meters": int(route["distanceMeters"]),
            "duration_seconds": duration_s,
            "encoded_polyline": route["polyline"]["encodedPolyline"],
        })

    return results


def decode_route(encoded: str) -> List[Tuple[float, float]]:
    return poly_lib.decode(encoded)


# ---------------------------------------------------------------------------
# Reverse geocoding — district lookup for MET Malaysia forecast
# ---------------------------------------------------------------------------

_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"

async def reverse_geocode_district(lat: float, lng: float) -> Optional[str]:
    """
    Return the sub-locality (district/mukim) name for the given coordinate
    using Google Geocoding API, for use as a MET Malaysia district lookup key.

    Returns None if the request fails or no district-level component is found.
    """
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(
                _GEOCODE_URL,
                params={
                    "latlng": f"{lat},{lng}",
                    "key": settings.google_maps_api_key,
                    "result_type": "sublocality|locality|administrative_area_level_3",
                    "language": "ms",   # Bahasa Melayu names match MET district names
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        log.warning("Geocode district lookup failed for (%.4f, %.4f): %r", lat, lng, exc)
        return None

    results = data.get("results", [])
    if not results:
        return None

    # Walk address components — prefer sublocality_level_1, then locality
    priority = [
        "sublocality_level_1",
        "sublocality",
        "locality",
        "administrative_area_level_3",
        "administrative_area_level_2",
    ]
    components: list[dict] = results[0].get("address_components", [])
    type_map: dict[str, str] = {}
    for comp in components:
        for t in comp.get("types", []):
            if t not in type_map:
                type_map[t] = comp["long_name"]

    for ptype in priority:
        if ptype in type_map:
            return type_map[ptype]

    return None
