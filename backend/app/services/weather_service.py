"""
Weather service — WeatherAPI.com
Free tier: 1,000,000 calls/month, no credit card needed.
Sign up at https://www.weatherapi.com/signup.aspx
"""
import logging
import math
from datetime import datetime, timezone
from typing import List

import httpx

from app.config import settings
from app.models.schemas import WeatherCondition

log = logging.getLogger(__name__)

WEATHERAPI_URL = "https://api.weatherapi.com/v1/forecast.json"

# ---------------------------------------------------------------------------
# WeatherAPI.com condition code → (status, emoji)
# Full code list: https://www.weatherapi.com/docs/weather_conditions.json
#
# Three-tier guide (PM's definition):
#   Green  — Clear / Partly Cloudy.  Ride on!
#   Yellow — Cloudy / Light Rain.    Langit dah gelap, bersedia.
#   Red    — Rain / Storm.           Bahaya, cari tempat berteduh.
# ---------------------------------------------------------------------------

# fmt: off
CONDITIONS: dict[int, tuple[str, str]] = {
    # ── Green: clear / light cloud ─────────────────────────────────────────
    1000: ("green",  "☀️"),   # Sunny / Clear
    1003: ("green",  "⛅"),   # Partly cloudy

    # ── Yellow: cloudy / fog / light anything ──────────────────────────────
    1006: ("yellow", "☁️"),   # Cloudy          ← was green
    1009: ("yellow", "☁️"),   # Overcast        ← was green
    1030: ("yellow", "🌫️"),  # Mist
    1135: ("yellow", "🌫️"),  # Fog
    1147: ("yellow", "🌫️"),  # Freezing fog
    1063: ("yellow", "🌦️"),  # Patchy rain possible
    1066: ("yellow", "🌨️"),  # Patchy snow possible
    1069: ("yellow", "🌨️"),  # Patchy sleet possible
    1072: ("yellow", "🌦️"),  # Patchy freezing drizzle
    1114: ("yellow", "🌨️"),  # Blowing snow
    1117: ("yellow", "❄️"),  # Blizzard
    1150: ("yellow", "🌦️"),  # Patchy light drizzle
    1153: ("yellow", "🌦️"),  # Light drizzle
    1168: ("yellow", "🌦️"),  # Freezing drizzle
    1171: ("yellow", "🌧️"),  # Heavy freezing drizzle
    1180: ("yellow", "🌦️"),  # Patchy light rain
    1183: ("yellow", "🌦️"),  # Light rain
    1186: ("yellow", "🌦️"),  # Moderate rain at times
    1198: ("yellow", "🌦️"),  # Light freezing rain
    1204: ("yellow", "🌨️"),  # Light sleet
    1210: ("yellow", "❄️"),  # Patchy light snow
    1213: ("yellow", "❄️"),  # Light snow
    1216: ("yellow", "❄️"),  # Patchy moderate snow
    1219: ("yellow", "❄️"),  # Moderate snow
    1222: ("yellow", "❄️"),  # Patchy heavy snow
    1237: ("yellow", "❄️"),  # Ice pellets
    1240: ("yellow", "🌦️"),  # Light rain shower
    1249: ("yellow", "🌨️"),  # Light sleet showers
    1252: ("yellow", "🌨️"),  # Moderate or heavy sleet showers
    1255: ("yellow", "❄️"),  # Light snow showers
    1261: ("yellow", "❄️"),  # Light ice pellet showers

    # ── Red: rain / thunderstorm ───────────────────────────────────────────
    1087: ("red",    "⛈️"),  # Thundery outbreaks possible
    1189: ("red",    "🌧️"),  # Moderate rain
    1192: ("red",    "🌧️"),  # Heavy rain at times
    1195: ("red",    "🌧️"),  # Heavy rain
    1201: ("red",    "🌧️"),  # Heavy freezing rain
    1207: ("red",    "🌨️"),  # Moderate or heavy sleet
    1225: ("red",    "❄️"),  # Heavy snow
    1243: ("red",    "🌧️"),  # Moderate or heavy rain shower  ← was yellow
    1246: ("red",    "🌧️"),  # Torrential rain shower
    1258: ("red",    "❄️"),  # Moderate or heavy snow showers
    1264: ("red",    "❄️"),  # Moderate or heavy ice pellet showers
    1273: ("red",    "⛈️"),  # Patchy light rain with thunder
    1276: ("red",    "⛈️"),  # Moderate or heavy rain with thunder
    1279: ("red",    "⛈️"),  # Patchy light snow with thunder
    1282: ("red",    "⛈️"),  # Moderate or heavy snow with thunder
}
# fmt: on

# Yellow codes that can be downgraded to green when cloud is low + low precip prob
SOFT_CODES = {1063, 1066, 1069, 1072, 1150, 1153, 1180, 1183, 1240}


def _from_measurements(
    precip_mm: float, cloud: int, is_day: int, chance_rain: float = 0
) -> tuple[str, str, str] | None:
    """
    Derive (status, description, emoji) from ACTUAL measured values.
    Returns None when measurements are ambiguous — let condition code decide.

    Three-tier guide:
      Green  — Clear / Partly Cloudy / Cloudy.  Ride on!
      Yellow — Overcast / Noticeable light rain. Bersedia.
      Red    — Actual rain / Storm.              Bahaya.

    Noise filter: WeatherAPI's gridded forecast assigns 0.1–0.7mm to cells
    even when no rain is occurring (model smoothing artefact). We require
    BOTH a meaningful precip amount AND a meaningful rain probability before
    calling it rain, to avoid false "Light Rain" on a sunny day.
    """
    # ── Red: definite rain ────────────────────────────────────────────────
    if precip_mm >= 5:
        return "red",    "Heavy Rain", "🌧️"
    if precip_mm >= 2:
        return "red",    "Rain",       "🌧️"

    # ── Yellow: noticeable light rain ─────────────────────────────────────
    # Require meaningful amount (≥ 1mm) OR moderate amount + real probability.
    # < 1mm with chance < 40% is almost always a model artefact — ignore it.
    if precip_mm >= 1.0:
        return "yellow", "Light Rain",  "🌦️"
    if precip_mm >= 0.5 and chance_rain >= 40:
        return "yellow", "Light Rain",  "🌦️"

    # ── Cloud-based (mendung) — main indicator per PM ─────────────────────
    if cloud >= 80:
        return "yellow", "Overcast",    "☁️"
    if cloud >= 50:
        return "yellow", "Cloudy",      "☁️"

    # ── Green: clear sky ──────────────────────────────────────────────────
    if cloud <= 15:
        desc  = "Clear" if is_day else "Clear Night"
        emoji = "☀️"   if is_day else "🌙"
        return "green", desc, emoji
    return "green", "Partly Cloudy", "⛅"


def _forecast_days(eta: datetime) -> int:
    """Days of forecast needed, capped at 3 (free tier limit)."""
    now = datetime.now(timezone.utc)
    if eta.tzinfo is None:
        eta = eta.replace(tzinfo=timezone.utc)
    delta_h = max((eta - now).total_seconds() / 3600, 0)
    return int(min(max(math.ceil(delta_h / 24) + 1, 1), 3))


def _fallback() -> WeatherCondition:
    return WeatherCondition(
        status="green",
        label="",
        description="Weather data unavailable",
        temperature=0.0,
        feels_like=0.0,
        humidity=0,
        wind_speed=0.0,
        precipitation_prob=0.0,
        weather_code=0,
        icon_code="🌡️",
    )


# ---------------------------------------------------------------------------
# Main function
# ---------------------------------------------------------------------------

async def get_weather_for_waypoints(waypoints: List[dict]) -> List[WeatherCondition]:
    conditions: List[WeatherCondition] = []

    async with httpx.AsyncClient(timeout=10.0) as client:
        for wp in waypoints:
            try:
                days = _forecast_days(wp["eta"])
                resp = await client.get(
                    WEATHERAPI_URL,
                    params={
                        "key": settings.weatherapi_key,
                        "q": f"{wp['lat']},{wp['lng']}",
                        "days": days,
                        "aqi": "no",
                        "alerts": "no",
                    },
                )
                resp.raise_for_status()
                data = resp.json()

                # Flatten all hours across forecast days
                all_hours: list = []
                for day in data.get("forecast", {}).get("forecastday", []):
                    all_hours.extend(day.get("hour", []))

                target_ts = wp["eta"].timestamp()

                if all_hours:
                    hour = min(all_hours, key=lambda h: abs(h.get("time_epoch", 0) - target_ts))
                    cond_obj    = hour.get("condition", {})
                    code        = int(cond_obj.get("code", 1000))
                    is_day      = int(hour.get("is_day", 1))
                    chance_rain = float(hour.get("chance_of_rain", 0))
                    precip_mm   = float(hour.get("precip_mm", 0))
                    cloud       = int(hour.get("cloud", 50))
                    temp        = float(hour.get("temp_c", 0))
                    feels       = float(hour.get("feelslike_c", 0))
                    humidity    = int(hour.get("humidity", 0))
                    wind_ms     = round(float(hour.get("wind_kph", 0)) / 3.6, 1)
                    api_desc    = cond_obj.get("text", "Clear")
                else:
                    cur         = data.get("current", {})
                    cond_obj    = cur.get("condition", {})
                    code        = int(cond_obj.get("code", 1000))
                    is_day      = int(cur.get("is_day", 1))
                    chance_rain = 0.0
                    precip_mm   = float(cur.get("precip_mm", 0))
                    cloud       = int(cur.get("cloud", 50))
                    temp        = float(cur.get("temp_c", 0))
                    feels       = float(cur.get("feelslike_c", 0))
                    humidity    = int(cur.get("humidity", 0))
                    wind_ms     = round(float(cur.get("wind_kph", 0)) / 3.6, 1)
                    api_desc    = cond_obj.get("text", "Clear")

                log.debug(
                    "(%.4f,%.4f) code=%s precip=%.2fmm cloud=%d%% chance=%d%% → %s",
                    wp["lat"], wp["lng"], code, precip_mm, cloud, chance_rain, api_desc,
                )

                # ── Reality check: trust measurements over area-radar labels ──
                measured = _from_measurements(precip_mm, cloud, is_day, chance_rain)
                if measured:
                    status, description, emoji = measured
                    display_precip = max(precip_mm / 10, chance_rain / 100)
                else:
                    status, emoji = CONDITIONS.get(code, ("green", "☀️"))
                    if code == 1000 and not is_day:
                        emoji = "🌙"
                    # Downgrade soft yellow codes when sky is still clear
                    if status == "yellow" and code in SOFT_CODES and chance_rain < 35 and cloud < 50:
                        status = "green"
                    description = api_desc
                    display_precip = chance_rain / 100

                conditions.append(
                    WeatherCondition(
                        status=status,
                        label="",
                        description=description,
                        temperature=round(temp, 1),
                        feels_like=round(feels, 1),
                        humidity=humidity,
                        wind_speed=wind_ms,
                        precipitation_prob=round(display_precip, 2),
                        weather_code=code,
                        icon_code=emoji,
                    )
                )

            except httpx.HTTPStatusError as exc:
                log.error("WeatherAPI HTTP %s for (%.4f, %.4f): %s",
                          exc.response.status_code, wp["lat"], wp["lng"], exc.response.text[:300])
                conditions.append(_fallback())
            except Exception as exc:
                log.error("Weather error for (%.4f, %.4f): %r", wp["lat"], wp["lng"], exc)
                conditions.append(_fallback())

    return conditions
