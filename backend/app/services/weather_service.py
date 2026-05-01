"""
Weather service — 5-provider cascade fallback:
  1. XWeather      — road weather, SE Asia
  2. Meteoblue     — high-res, good tropics coverage
  3. Tomorrow.io   — ML-enhanced, realtime for start/dest
  4. Open-Meteo    — ECMWF, fully free, no limit
  5. WeatherAPI    — GFS, last resort

Provider exhaustion flags are module-level and reset on server restart.
They are exported so the router can expose them via /api/provider-status.
"""
import logging
import math
from datetime import datetime, timezone
from typing import List

import httpx

from app.config import settings
from app.models.schemas import WeatherCondition

log = logging.getLogger(__name__)


class _RateLimitError(Exception):
    pass


# ── Module-level exhaustion flags (exported for /api/provider-status) ─────
xweather_exhausted:    bool = False
meteoblue_exhausted:   bool = False
tomorrow_exhausted:    bool = False
open_meteo_exhausted:  bool = False


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
    """Rough day/night check for Malaysia (UTC+8)."""
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
    """Reality-check: filter GFS/ECMWF phantom rain artefacts."""
    if precip_mm >= 5:   return "red",    "Heavy Rain",   "🌧️"
    if precip_mm >= 2:   return "red",    "Rain",         "🌧️"
    if precip_mm >= 1.0: return "yellow", "Light Rain",   "🌦️"
    if precip_mm >= 0.5 and chance_rain >= 40:
                         return "yellow", "Light Rain",   "🌦️"
    if cloud >= 80:      return "yellow", "Overcast",     "☁️"
    if cloud >= 50:      return "yellow", "Cloudy",       "☁️"
    if cloud <= 15:
        return "green", ("Clear" if day else "Clear Night"), ("☀️" if day else "🌙")
    return "green", "Partly Cloudy", "⛅"


# ===========================================================================
# Provider 1 — XWeather (road weather)
# ===========================================================================

XWEATHER_URL = "https://data.api.xweather.com/roadweather/{loc}"

# weatherPrimaryCoded suffix → status
# Format: [qualifier:][coverage:]weather  e.g. "::CL", "::RA", "HVY::TSRA"
def _xweather_status(coded: str, precip_mm: float, cloud_pct: int, day: bool) -> tuple[str, str, str]:
    c = (coded or "").upper()
    if any(x in c for x in ["TSRA", "TS", ":LTG"]):
        return "red", "Thunderstorm", "⛈️"
    if any(x in c for x in [":RA", "SHRA", "FZRA", "RAIN"]):
        return "red" if precip_mm >= 2 else "yellow", "Rain" if precip_mm >= 2 else "Light Rain", "🌧️" if precip_mm >= 2 else "🌦️"
    if c.endswith(":OV") or c.endswith("OVC"):
        return "yellow", "Overcast", "☁️"
    if any(x in c for x in [":BK", ":SC", "SCT", "BKN", "FOG", "MIST", "FG"]):
        return "yellow", "Cloudy", "☁️"
    # CL, FW, SKC, CLR → green
    return "green", ("Clear" if day else "Clear Night"), ("☀️" if day else "🌙")


async def _get_xweather(wp: dict, client: httpx.AsyncClient) -> WeatherCondition:
    resp = await client.get(
        XWEATHER_URL.format(loc=f"{wp['lat']},{wp['lng']}"),
        params={
            "client_id":     settings.xweather_client_id,
            "client_secret": settings.xweather_client_secret,
            "format":        "json",
            "filter":        "allstations",
        },
        timeout=10.0,
    )
    if resp.status_code in (429, 403):
        raise _RateLimitError("XWeather")
    resp.raise_for_status()

    data = resp.json()
    if not data.get("success") or not data.get("response"):
        raise ValueError("XWeather: empty response")

    ob   = data["response"][0]["ob"]
    day  = _is_day(wp["eta"])

    temp        = float(ob.get("tempC") or 0)
    feels       = float(ob.get("feelslikeC") or temp)
    humidity    = int(ob.get("humidity") or 0)
    wind_ms     = round(float(ob.get("windSpeedKPH") or 0) / 3.6, 1)
    precip_mm   = float(ob.get("precipMM") or 0)
    cloud_pct   = int(ob.get("sky") or 50)
    coded       = ob.get("weatherPrimaryCoded", "")

    measured = _from_measurements(precip_mm, cloud_pct, day)
    if measured:
        status, description, emoji = measured
    else:
        status, description, emoji = _xweather_status(coded, precip_mm, cloud_pct, day)

    log.debug("[XWeather] (%.4f,%.4f) coded=%s precip=%.2fmm → %s",
              wp["lat"], wp["lng"], coded, precip_mm, description)

    return WeatherCondition(
        status=status, label="", description=description,
        temperature=round(temp, 1), feels_like=round(feels, 1),
        humidity=humidity, wind_speed=wind_ms,
        precipitation_prob=round(precip_mm / 10, 2),
        weather_code=0, icon_code=emoji,
    )


# ===========================================================================
# Provider 2 — Meteoblue
# ===========================================================================

METEOBLUE_URL = "https://my.meteoblue.com/packages/basic-1h"

# Pictocode → (status, description, emoji)
# fmt: off
METEOBLUE_CONDITIONS: dict[int, tuple[str, str, str]] = {
    1:  ("green",  "Clear",          "☀️"),
    2:  ("green",  "Mostly Clear",   "⛅"),
    3:  ("green",  "Partly Cloudy",  "⛅"),
    4:  ("yellow", "Overcast",       "☁️"),
    5:  ("yellow", "Fog",            "🌫️"),
    6:  ("yellow", "Freezing Fog",   "🌫️"),
    7:  ("yellow", "Light Rain",     "🌦️"),
    8:  ("yellow", "Rain Shower",    "🌦️"),
    9:  ("red",    "Heavy Shower",   "🌧️"),
    10: ("red",    "Rain",           "🌧️"),
    11: ("red",    "Heavy Rain",     "🌧️"),
    12: ("red",    "Rain & Snow",    "🌧️"),
    13: ("red",    "Heavy Mix",      "🌧️"),
    14: ("red",    "Sleet",          "🌧️"),
    15: ("red",    "Heavy Sleet",    "🌧️"),
    16: ("yellow", "Light Snow",     "❄️"),
    17: ("red",    "Snow Shower",    "❄️"),
    18: ("red",    "Snow",           "❄️"),
    19: ("red",    "Heavy Snow",     "❄️"),
    20: ("red",    "Ice Rain",       "🌧️"),
    21: ("red",    "Thunderstorm",   "⛈️"),
    22: ("red",    "Light Thunder",  "⛈️"),
    23: ("red",    "Thunder & Rain", "⛈️"),
    24: ("red",    "Thunder & Hail", "⛈️"),
    25: ("red",    "Thunder & Hail", "⛈️"),
    26: ("green",  "Mostly Clear",   "🌙"),   # night variants
    27: ("green",  "Partly Cloudy",  "🌙"),
    28: ("green",  "Clear Night",    "🌙"),
    29: ("yellow", "Overcast",       "☁️"),
    30: ("red",    "Rain",           "🌧️"),
}
# fmt: on


async def _get_meteoblue(wp: dict, client: httpx.AsyncClient) -> WeatherCondition:
    resp = await client.get(
        METEOBLUE_URL,
        params={
            "apikey":  settings.meteoblue_api_key,
            "lat":     wp["lat"],
            "lon":     wp["lng"],
            "asl":     50,       # default altitude (m) for Malaysia lowlands
            "format":  "json",
        },
        timeout=10.0,
    )
    if resp.status_code in (429, 403):
        raise _RateLimitError("Meteoblue")
    resp.raise_for_status()

    data = resp.json()
    h1   = data.get("data_1h", {})
    times = h1.get("time", [])
    if not times:
        raise ValueError("Meteoblue: no hourly data")

    target_ts = wp["eta"].timestamp()
    best_i = min(
        range(len(times)),
        key=lambda i: abs(
            datetime.fromisoformat(times[i]).replace(tzinfo=timezone.utc).timestamp() - target_ts
        ),
    )

    def hv(field):
        vals = h1.get(field, [])
        return vals[best_i] if best_i < len(vals) else 0

    pictocode   = int(hv("pictocode") or 1)
    temp        = float(hv("temperature") or 0)
    humidity    = int(hv("relativehumidity") or 0)
    wind_ms     = round(float(hv("windspeed") or 0) / 3.6, 1)  # km/h → m/s
    precip_mm   = float(hv("precipitation") or 0)
    chance_rain = float(hv("precipitation_probability") or 0)
    day         = _is_day(wp["eta"])

    measured = _from_measurements(precip_mm, 50, day, chance_rain)
    if measured:
        status, description, emoji = measured
    else:
        status, description, emoji = METEOBLUE_CONDITIONS.get(pictocode, ("green", "Clear", "☀️"))

    log.debug("[Meteoblue] (%.4f,%.4f) picto=%s precip=%.2fmm → %s",
              wp["lat"], wp["lng"], pictocode, precip_mm, description)

    return WeatherCondition(
        status=status, label="", description=description,
        temperature=round(temp, 1), feels_like=round(temp, 1),
        humidity=humidity, wind_speed=wind_ms,
        precipitation_prob=round(max(precip_mm / 10, chance_rain / 100), 2),
        weather_code=pictocode, icon_code=emoji,
    )


# ===========================================================================
# Provider 3 — Tomorrow.io
# ===========================================================================

TOMORROW_REALTIME_URL = "https://api.tomorrow.io/v4/weather/realtime"
TOMORROW_FORECAST_URL = "https://api.tomorrow.io/v4/weather/forecast"

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


async def _get_tomorrow_realtime(wp: dict, client: httpx.AsyncClient) -> WeatherCondition:
    resp = await client.get(
        TOMORROW_REALTIME_URL,
        params={"location": f"{wp['lat']},{wp['lng']}", "apikey": settings.tomorrow_api_key, "units": "metric"},
        timeout=10.0,
    )
    if resp.status_code == 429:
        raise _RateLimitError("Tomorrow.io")
    resp.raise_for_status()

    v           = resp.json()["data"]["values"]
    day         = _is_day(wp["eta"])
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

    log.debug("[Tomorrow.io REALTIME] (%.4f,%.4f) code=%s precip=%.2fmm → %s",
              wp["lat"], wp["lng"], code, precip_mm, description)

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
        params={"location": f"{wp['lat']},{wp['lng']}", "apikey": settings.tomorrow_api_key, "timesteps": "1h", "units": "metric"},
        timeout=10.0,
    )
    if resp.status_code == 429:
        raise _RateLimitError("Tomorrow.io")
    resp.raise_for_status()

    hours = resp.json().get("timelines", {}).get("hourly", [])
    if not hours:
        raise ValueError("Tomorrow.io returned no hourly data")

    target_ts = wp["eta"].timestamp()
    hour = min(hours, key=lambda h: abs(
        datetime.fromisoformat(h["time"].replace("Z", "+00:00")).timestamp() - target_ts
    ))
    v = hour["values"]

    day         = _is_day(wp["eta"])
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

    log.debug("[Tomorrow.io] (%.4f,%.4f) code=%s precip=%.2fmm → %s",
              wp["lat"], wp["lng"], code, precip_mm, description)

    return WeatherCondition(
        status=status, label="", description=description,
        temperature=round(temp, 1), feels_like=round(feels, 1),
        humidity=humidity, wind_speed=wind_ms,
        precipitation_prob=round(max(precip_mm / 10, chance_rain / 100), 2),
        weather_code=code, icon_code=emoji,
    )


# ===========================================================================
# Provider 4 — Open-Meteo (ECMWF, free, no limit)
# ===========================================================================

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

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

    times     = data["hourly"]["time"]
    target_ts = wp["eta"].timestamp()
    best_i    = min(
        range(len(times)),
        key=lambda i: abs(
            datetime.fromisoformat(times[i]).replace(tzinfo=timezone.utc).timestamp() - target_ts
        ),
    )

    def hv(field):
        return data["hourly"][field][best_i]

    code        = int(hv("weather_code"))
    precip_mm   = float(hv("precipitation") or 0)
    cloud       = int(hv("cloud_cover") or 50)
    chance_rain = float(hv("precipitation_probability") or 0)
    temp        = float(hv("temperature_2m"))
    feels       = float(hv("apparent_temperature"))
    humidity    = int(hv("relative_humidity_2m"))
    wind_ms     = round(float(hv("wind_speed_10m")) / 3.6, 1)
    day         = _is_day(wp["eta"])

    measured = _from_measurements(precip_mm, cloud, day, chance_rain)
    if measured:
        status, description, emoji = measured
    else:
        status, description, emoji = OPEN_METEO_CONDITIONS.get(code, ("green", "Clear", "☀️"))
        if code == 0 and not day:
            emoji = "🌙"; description = "Clear Night"

    log.debug("[Open-Meteo] (%.4f,%.4f) wmo=%s precip=%.2fmm → %s",
              wp["lat"], wp["lng"], code, precip_mm, description)

    return WeatherCondition(
        status=status, label="", description=description,
        temperature=round(temp, 1), feels_like=round(feels, 1),
        humidity=humidity, wind_speed=wind_ms,
        precipitation_prob=round(max(precip_mm / 10, chance_rain / 100), 2),
        weather_code=code, icon_code=emoji,
    )


# ===========================================================================
# Provider 5 — WeatherAPI.com (GFS, final fallback)
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
        hour        = min(all_hours, key=lambda h: abs(h.get("time_epoch", 0) - target_ts))
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
        cur         = data.get("current", {})
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

    log.debug("[WeatherAPI] (%.4f,%.4f) code=%s precip=%.2fmm → %s",
              wp["lat"], wp["lng"], code, precip_mm, description)

    return WeatherCondition(
        status=status, label="", description=description,
        temperature=round(temp, 1), feels_like=round(feels, 1),
        humidity=humidity, wind_speed=wind_ms,
        precipitation_prob=round(display_precip, 2),
        weather_code=code, icon_code=emoji,
    )


# ===========================================================================
# Cascade orchestrator  (XWeather → Meteoblue → Tomorrow → Open-Meteo → WeatherAPI)
# ===========================================================================

async def _get_weather_cascade(wp: dict, client: httpx.AsyncClient) -> WeatherCondition:
    global xweather_exhausted, meteoblue_exhausted, tomorrow_exhausted, open_meteo_exhausted

    # ── 1. XWeather ─────────────────────────────────────────────────────────
    if not xweather_exhausted and settings.xweather_client_id:
        try:
            return await _get_xweather(wp, client)
        except _RateLimitError:
            xweather_exhausted = True
            log.warning("XWeather quota hit — falling back to Meteoblue")
        except Exception as exc:
            log.warning("XWeather error: %r — trying Meteoblue", exc)

    # ── 2. Meteoblue ─────────────────────────────────────────────────────────
    if not meteoblue_exhausted and settings.meteoblue_api_key:
        try:
            return await _get_meteoblue(wp, client)
        except _RateLimitError:
            meteoblue_exhausted = True
            log.warning("Meteoblue quota hit — falling back to Tomorrow.io")
        except Exception as exc:
            log.warning("Meteoblue error: %r — trying Tomorrow.io", exc)

    # ── 3. Tomorrow.io ───────────────────────────────────────────────────────
    if not tomorrow_exhausted and settings.tomorrow_api_key:
        try:
            if wp.get("realtime"):
                return await _get_tomorrow_realtime(wp, client)
            return await _get_tomorrow(wp, client)
        except _RateLimitError:
            tomorrow_exhausted = True
            log.warning("Tomorrow.io daily limit hit — falling back to Open-Meteo")
        except Exception as exc:
            log.warning("Tomorrow.io error: %r — trying Open-Meteo", exc)

    # ── 4. Open-Meteo ────────────────────────────────────────────────────────
    if not open_meteo_exhausted:
        try:
            return await _get_open_meteo(wp, client)
        except Exception as exc:
            open_meteo_exhausted = True
            log.warning("Open-Meteo error: %r — trying WeatherAPI", exc)

    # ── 5. WeatherAPI ────────────────────────────────────────────────────────
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
