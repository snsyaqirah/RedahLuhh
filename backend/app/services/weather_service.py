"""
Weather service — cascade fallback:
  1st: Tomorrow.io   (best ML model for SE Asia, 500 calls/day free)
  2nd: Open-Meteo    (ECMWF model, fully free, no key needed)
  3rd: WeatherAPI    (GFS model, 1M calls/month free)

Provider state resets on server restart (fine — Render free tier restarts daily).
"""
import logging
import math
from datetime import datetime, timezone
from typing import List

import httpx

from app.config import settings
from app.models.schemas import WeatherCondition

log = logging.getLogger(__name__)

# ── Module-level exhaustion flags (reset on restart) ──────────────────────
_tomorrow_exhausted: bool = False
_open_meteo_exhausted: bool = False


# ===========================================================================
# Shared helpers
# ===========================================================================

def _forecast_days(eta: datetime) -> int:
    now = datetime.now(timezone.utc)
    if eta.tzinfo is None:
        eta = eta.replace(tzinfo=timezone.utc)
    delta_h = max((eta - now).total_seconds() / 3600, 0)
    return int(min(max(math.ceil(delta_h / 24) + 1, 1), 3))


def _is_day(eta: datetime) -> bool:
    """Rough day/night check based on Malaysia local time (UTC+8)."""
    local_hour = (eta.hour + 8) % 24
    return 6 <= local_hour < 19


def _fallback() -> WeatherCondition:
    return WeatherCondition(
        status="green", label="", description="Weather data unavailable",
        temperature=0.0, feels_like=0.0, humidity=0,
        wind_speed=0.0, precipitation_prob=0.0, weather_code=0, icon_code="🌡️",
    )


def _from_measurements(
    precip_mm: float, cloud: int, day: bool, chance_rain: float = 0
) -> tuple[str, str, str] | None:
    """
    Reality-check: derive status from actual sensor values.
    Filters out GFS/ECMWF model artefacts (0.1–0.7mm phantom rain).
    """
    if precip_mm >= 5:
        return "red",    "Heavy Rain",   "🌧️"
    if precip_mm >= 2:
        return "red",    "Rain",         "🌧️"
    if precip_mm >= 1.0:
        return "yellow", "Light Rain",   "🌦️"
    if precip_mm >= 0.5 and chance_rain >= 40:
        return "yellow", "Light Rain",   "🌦️"
    if cloud >= 80:
        return "yellow", "Overcast",     "☁️"
    if cloud >= 50:
        return "yellow", "Cloudy",       "☁️"
    if cloud <= 15:
        desc  = "Clear"      if day else "Clear Night"
        emoji = "☀️"        if day else "🌙"
        return "green", desc, emoji
    return "green", "Partly Cloudy", "⛅"


# ===========================================================================
# Provider 1 — Tomorrow.io
# ===========================================================================

# fmt: off
TOMORROW_CONDITIONS: dict[int, tuple[str, str, str]] = {
    1000: ("green",  "Clear",          "☀️"),
    1100: ("green",  "Mostly Clear",   "⛅"),
    1101: ("green",  "Partly Cloudy",  "⛅"),
    1102: ("yellow", "Mostly Cloudy",  "☁️"),
    1001: ("yellow", "Cloudy",         "☁️"),
    2000: ("yellow", "Fog",            "🌫️"),
    2100: ("yellow", "Light Fog",      "🌫️"),
    4000: ("yellow", "Drizzle",        "🌦️"),
    4200: ("yellow", "Light Rain",     "🌦️"),
    4001: ("red",    "Rain",           "🌧️"),
    4201: ("red",    "Heavy Rain",     "🌧️"),
    8000: ("red",    "Thunderstorm",   "⛈️"),
}
# fmt: on

TOMORROW_REALTIME_URL = "https://api.tomorrow.io/v4/weather/realtime"
TOMORROW_FORECAST_URL = "https://api.tomorrow.io/v4/weather/forecast"


async def _get_tomorrow_realtime(wp: dict, client: httpx.AsyncClient) -> WeatherCondition:
    """Use Tomorrow.io /realtime for start & destination — actual sensor data."""
    resp = await client.get(
        TOMORROW_REALTIME_URL,
        params={
            "location": f"{wp['lat']},{wp['lng']}",
            "apikey":   settings.tomorrow_api_key,
            "units":    "metric",
        },
        timeout=10.0,
    )

    if resp.status_code == 429:
        raise _RateLimitError("Tomorrow.io realtime")

    resp.raise_for_status()
    v   = resp.json()["data"]["values"]
    day = _is_day(wp["eta"])

    precip_mm   = float(v.get("rainIntensity", 0) or v.get("precipitationIntensity", 0))
    cloud       = int(v.get("cloudCover", 50))
    chance_rain = float(v.get("precipitationProbability", 0))
    temp        = float(v.get("temperature", 0))
    feels       = float(v.get("temperatureApparent", temp))
    humidity    = int(v.get("humidity", 0))
    wind_ms     = round(float(v.get("windSpeed", 0)), 1)
    code        = int(v.get("weatherCode", 1000))

    measured = _from_measurements(precip_mm, cloud, day, chance_rain)
    if measured:
        status, description, emoji = measured
    else:
        status, description, emoji = TOMORROW_CONDITIONS.get(code, ("green", "Clear", "☀️"))
        if code == 1000 and not day:
            emoji = "🌙"; description = "Clear Night"

    log.debug("[Tomorrow.io REALTIME] (%.4f,%.4f) code=%s precip=%.2fmm cloud=%d%% → %s",
              wp["lat"], wp["lng"], code, precip_mm, cloud, description)

    return WeatherCondition(
        status=status, label="", description=description,
        temperature=round(temp, 1), feels_like=round(feels, 1),
        humidity=humidity, wind_speed=wind_ms,
        precipitation_prob=round(max(precip_mm / 10, chance_rain / 100), 2),
        weather_code=code, icon_code=emoji,
    )


async def _get_tomorrow(wp: dict, client: httpx.AsyncClient) -> WeatherCondition:
    resp = await client.get(
        TOMORROW_FORECAST_URL,
        params={
            "location": f"{wp['lat']},{wp['lng']}",
            "apikey":   settings.tomorrow_api_key,
            "timesteps": "1h",
            "units":    "metric",
        },
        timeout=10.0,
    )

    if resp.status_code == 429:
        raise _RateLimitError("Tomorrow.io")

    resp.raise_for_status()
    data = resp.json()

    hours = data.get("timelines", {}).get("hourly", [])
    if not hours:
        raise ValueError("Tomorrow.io returned no hourly data")

    target_ts = wp["eta"].timestamp()
    hour = min(hours, key=lambda h: abs(
        datetime.fromisoformat(h["time"].replace("Z", "+00:00")).timestamp() - target_ts
    ))
    v = hour["values"]

    precip_mm   = float(v.get("rainIntensity", 0) or v.get("precipitationIntensity", 0))
    cloud       = int(v.get("cloudCover", 50))
    chance_rain = float(v.get("precipitationProbability", 0))
    temp        = float(v.get("temperature", 0))
    feels       = float(v.get("temperatureApparent", temp))
    humidity    = int(v.get("humidity", 0))
    wind_ms     = round(float(v.get("windSpeed", 0)), 1)   # already m/s from Tomorrow
    code        = int(v.get("weatherCode", 1000))
    day         = _is_day(wp["eta"])

    measured = _from_measurements(precip_mm, cloud, day, chance_rain)
    if measured:
        status, description, emoji = measured
    else:
        status, description, emoji = TOMORROW_CONDITIONS.get(code, ("green", "Clear", "☀️"))
        if code == 1000 and not day:
            emoji = "🌙"; description = "Clear Night"

    log.debug("[Tomorrow.io] (%.4f,%.4f) code=%s precip=%.2fmm cloud=%d%% → %s",
              wp["lat"], wp["lng"], code, precip_mm, cloud, description)

    return WeatherCondition(
        status=status, label="", description=description,
        temperature=round(temp, 1), feels_like=round(feels, 1),
        humidity=humidity, wind_speed=wind_ms,
        precipitation_prob=round(max(precip_mm / 10, chance_rain / 100), 2),
        weather_code=code, icon_code=emoji,
    )


# ===========================================================================
# Provider 2 — Open-Meteo  (ECMWF, fully free, no key)
# ===========================================================================

# WMO codes → (status, description, emoji)
# fmt: off
OPEN_METEO_CONDITIONS: dict[int, tuple[str, str, str]] = {
    0:  ("green",  "Clear",          "☀️"),
    1:  ("green",  "Mainly Clear",   "⛅"),
    2:  ("green",  "Partly Cloudy",  "⛅"),
    3:  ("yellow", "Overcast",       "☁️"),
    45: ("yellow", "Fog",            "🌫️"),
    48: ("yellow", "Icy Fog",        "🌫️"),
    51: ("yellow", "Drizzle",        "🌦️"),
    53: ("yellow", "Drizzle",        "🌦️"),
    55: ("yellow", "Heavy Drizzle",  "🌦️"),
    61: ("yellow", "Light Rain",     "🌦️"),
    63: ("red",    "Rain",           "🌧️"),
    65: ("red",    "Heavy Rain",     "🌧️"),
    80: ("yellow", "Rain Shower",    "🌦️"),
    81: ("red",    "Rain Shower",    "🌧️"),
    82: ("red",    "Heavy Shower",   "🌧️"),
    95: ("red",    "Thunderstorm",   "⛈️"),
    96: ("red",    "Thunderstorm",   "⛈️"),
    99: ("red",    "Thunderstorm",   "⛈️"),
}
# fmt: on

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


async def _get_open_meteo(wp: dict, client: httpx.AsyncClient) -> WeatherCondition:
    resp = await client.get(
        OPEN_METEO_URL,
        params={
            "latitude":      wp["lat"],
            "longitude":     wp["lng"],
            "hourly":        ",".join([
                "temperature_2m", "apparent_temperature", "relative_humidity_2m",
                "precipitation_probability", "precipitation",
                "weather_code", "cloud_cover", "wind_speed_10m",
            ]),
            "timezone":      "Asia/Kuala_Lumpur",
            "forecast_days": _forecast_days(wp["eta"]),
        },
        timeout=10.0,
    )
    resp.raise_for_status()
    data = resp.json()

    times  = data["hourly"]["time"]
    target_ts = wp["eta"].timestamp()

    # Find nearest hour
    best_i = min(
        range(len(times)),
        key=lambda i: abs(
            datetime.fromisoformat(times[i]).replace(tzinfo=timezone.utc).timestamp() - target_ts
        ),
    )

    def h(field):
        return data["hourly"][field][best_i]

    code        = int(h("weather_code"))
    precip_mm   = float(h("precipitation") or 0)
    cloud       = int(h("cloud_cover") or 50)
    chance_rain = float(h("precipitation_probability") or 0)
    temp        = float(h("temperature_2m"))
    feels       = float(h("apparent_temperature"))
    humidity    = int(h("relative_humidity_2m"))
    wind_ms     = round(float(h("wind_speed_10m")) / 3.6, 1)   # km/h → m/s
    day         = _is_day(wp["eta"])

    measured = _from_measurements(precip_mm, cloud, day, chance_rain)
    if measured:
        status, description, emoji = measured
    else:
        status, description, emoji = OPEN_METEO_CONDITIONS.get(code, ("green", "Clear", "☀️"))
        if code == 0 and not day:
            emoji = "🌙"; description = "Clear Night"

    log.debug("[Open-Meteo] (%.4f,%.4f) wmo=%s precip=%.2fmm cloud=%d%% → %s",
              wp["lat"], wp["lng"], code, precip_mm, cloud, description)

    return WeatherCondition(
        status=status, label="", description=description,
        temperature=round(temp, 1), feels_like=round(feels, 1),
        humidity=humidity, wind_speed=wind_ms,
        precipitation_prob=round(max(precip_mm / 10, chance_rain / 100), 2),
        weather_code=code, icon_code=emoji,
    )


# ===========================================================================
# Provider 3 — WeatherAPI.com  (GFS model, final fallback)
# ===========================================================================

WEATHERAPI_URL = "https://api.weatherapi.com/v1/forecast.json"

# fmt: off
CONDITIONS: dict[int, tuple[str, str]] = {
    1000: ("green",  "☀️"),  1003: ("green",  "⛅"),
    1006: ("yellow", "☁️"),  1009: ("yellow", "☁️"),
    1030: ("yellow", "🌫️"), 1135: ("yellow", "🌫️"), 1147: ("yellow", "🌫️"),
    1063: ("yellow", "🌦️"), 1150: ("yellow", "🌦️"), 1153: ("yellow", "🌦️"),
    1168: ("yellow", "🌦️"), 1180: ("yellow", "🌦️"), 1183: ("yellow", "🌦️"),
    1186: ("yellow", "🌦️"), 1198: ("yellow", "🌦️"), 1240: ("yellow", "🌦️"),
    1087: ("red",    "⛈️"), 1189: ("red",    "🌧️"), 1192: ("red",    "🌧️"),
    1195: ("red",    "🌧️"), 1243: ("red",    "🌧️"), 1246: ("red",    "🌧️"),
    1273: ("red",    "⛈️"), 1276: ("red",    "⛈️"),
}
SOFT_CODES = {1063, 1150, 1153, 1180, 1183, 1240}
# fmt: on


async def _get_weatherapi(wp: dict, client: httpx.AsyncClient) -> WeatherCondition:
    days = _forecast_days(wp["eta"])
    resp = await client.get(
        WEATHERAPI_URL,
        params={"key": settings.weatherapi_key, "q": f"{wp['lat']},{wp['lng']}",
                "days": days, "aqi": "no", "alerts": "no"},
        timeout=10.0,
    )
    resp.raise_for_status()
    data = resp.json()

    all_hours: list = []
    for day_data in data.get("forecast", {}).get("forecastday", []):
        all_hours.extend(day_data.get("hour", []))

    target_ts = wp["eta"].timestamp()
    if all_hours:
        hour = min(all_hours, key=lambda h: abs(h.get("time_epoch", 0) - target_ts))
        cond_obj    = hour.get("condition", {})
        code        = int(cond_obj.get("code", 1000))
        is_day_int  = int(hour.get("is_day", 1))
        chance_rain = float(hour.get("chance_of_rain", 0))
        precip_mm   = float(hour.get("precip_mm", 0))
        cloud       = int(hour.get("cloud", 50))
        temp        = float(hour.get("temp_c", 0))
        feels       = float(hour.get("feelslike_c", 0))
        humidity    = int(hour.get("humidity", 0))
        wind_ms     = round(float(hour.get("wind_kph", 0)) / 3.6, 1)
        api_desc    = cond_obj.get("text", "Clear")
    else:
        cur = data.get("current", {})
        cond_obj    = cur.get("condition", {})
        code        = int(cond_obj.get("code", 1000))
        is_day_int  = int(cur.get("is_day", 1))
        chance_rain = 0.0
        precip_mm   = float(cur.get("precip_mm", 0))
        cloud       = int(cur.get("cloud", 50))
        temp        = float(cur.get("temp_c", 0))
        feels       = float(cur.get("feelslike_c", 0))
        humidity    = int(cur.get("humidity", 0))
        wind_ms     = round(float(cur.get("wind_kph", 0)) / 3.6, 1)
        api_desc    = cond_obj.get("text", "Clear")

    measured = _from_measurements(precip_mm, cloud, bool(is_day_int), chance_rain)
    if measured:
        status, description, emoji = measured
        display_precip = max(precip_mm / 10, chance_rain / 100)
    else:
        status, emoji = CONDITIONS.get(code, ("green", "☀️"))
        if code == 1000 and not is_day_int:
            emoji = "🌙"
        if status == "yellow" and code in SOFT_CODES and chance_rain < 35 and cloud < 50:
            status = "green"
        description    = api_desc
        display_precip = chance_rain / 100

    log.debug("[WeatherAPI] (%.4f,%.4f) code=%s precip=%.2fmm cloud=%d%% → %s",
              wp["lat"], wp["lng"], code, precip_mm, cloud, description)

    return WeatherCondition(
        status=status, label="", description=description,
        temperature=round(temp, 1), feels_like=round(feels, 1),
        humidity=humidity, wind_speed=wind_ms,
        precipitation_prob=round(display_precip, 2),
        weather_code=code, icon_code=emoji,
    )


# ===========================================================================
# Cascade orchestrator
# ===========================================================================

class _RateLimitError(Exception):
    pass


async def _get_weather_cascade(wp: dict, client: httpx.AsyncClient) -> WeatherCondition:
    global _tomorrow_exhausted, _open_meteo_exhausted

    # ── 1st: Tomorrow.io ────────────────────────────────────────────────────
    if not _tomorrow_exhausted and settings.tomorrow_api_key:
        try:
            # Start & destination get actual real-time sensor data
            if wp.get("realtime"):
                return await _get_tomorrow_realtime(wp, client)
            return await _get_tomorrow(wp, client)
        except _RateLimitError:
            _tomorrow_exhausted = True
            log.warning("Tomorrow.io daily limit hit — falling back to Open-Meteo")
        except Exception as exc:
            log.warning("Tomorrow.io error, trying Open-Meteo: %r", exc)

    # ── 2nd: Open-Meteo ─────────────────────────────────────────────────────
    if not _open_meteo_exhausted:
        try:
            return await _get_open_meteo(wp, client)
        except Exception as exc:
            log.warning("Open-Meteo error, trying WeatherAPI: %r", exc)
            _open_meteo_exhausted = True

    # ── 3rd: WeatherAPI ─────────────────────────────────────────────────────
    try:
        return await _get_weatherapi(wp, client)
    except Exception as exc:
        log.error("All providers failed for (%.4f, %.4f): %r", wp["lat"], wp["lng"], exc)
        return _fallback()


async def get_weather_for_waypoints(waypoints: List[dict]) -> List[WeatherCondition]:
    conditions: List[WeatherCondition] = []
    async with httpx.AsyncClient() as client:
        for wp in waypoints:
            conditions.append(await _get_weather_cascade(wp, client))
    return conditions
