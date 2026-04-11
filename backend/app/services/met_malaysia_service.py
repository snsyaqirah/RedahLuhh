"""
MET Malaysia Weather Service via api.data.gov.my
No API key needed. Official data from Jabatan Meteorologi Malaysia.

Two endpoints used:
  - /weather/warning   — active flood/storm/wind warnings (Malaysia-wide)
  - /weather/forecast  — 7-day district-level forecast (morning/afternoon/night)
"""
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

log = logging.getLogger(__name__)

# Trailing slash required — api.data.gov.my returns 301 without it
MET_FORECAST_URL = "https://api.data.gov.my/weather/forecast/"
MET_WARNING_URL  = "https://api.data.gov.my/weather/warning/"

# ---------------------------------------------------------------------------
# Bahasa Melayu forecast text → (status, english_description, emoji)
# ---------------------------------------------------------------------------
BM_MAP: dict[str, tuple[str, str, str]] = {
    "Tiada hujan":                                                  ("green",  "No Rain",                          "☀️"),
    "Berjerebu":                                                    ("yellow", "Hazy",                             "🌫️"),
    "Hujan":                                                        ("yellow", "Rain",                             "🌧️"),
    "Hujan di beberapa tempat":                                     ("yellow", "Scattered Rain",                   "🌧️"),
    "Hujan di satu dua tempat":                                     ("yellow", "Isolated Rain",                    "🌦️"),
    "Hujan di satu dua tempat di kawasan pantai":                   ("yellow", "Coastal Isolated Rain",            "🌦️"),
    "Hujan di satu dua tempat di kawasan pedalaman":                ("yellow", "Inland Isolated Rain",             "🌦️"),
    "Ribut petir":                                                  ("red",    "Thunderstorm",                     "⛈️"),
    "Ribut petir di beberapa tempat":                               ("red",    "Scattered Thunderstorms",          "⛈️"),
    "Ribut petir di beberapa tempat di kawasan pedalaman":          ("red",    "Inland Scattered Thunderstorms",   "⛈️"),
    "Ribut petir di satu dua tempat":                               ("yellow", "Isolated Thunderstorm",            "⛈️"),
    "Ribut petir di satu dua tempat di kawasan pantai":             ("yellow", "Coastal Isolated Thunderstorm",    "⛈️"),
    "Ribut petir di satu dua tempat di kawasan pedalaman":          ("yellow", "Inland Isolated Thunderstorm",     "⛈️"),
}


def _period(hour: int) -> str:
    """Map UTC+8 hour to MET forecast period key."""
    if 6 <= hour < 12:
        return "morning_forecast"
    elif 12 <= hour < 18:
        return "afternoon_forecast"
    else:
        return "night_forecast"


# ---------------------------------------------------------------------------
# Active warnings
# ---------------------------------------------------------------------------

async def get_active_warnings() -> list[dict]:
    """
    Return currently active MET Malaysia weather warnings (English).
    Each dict has: title, heading, text, valid_until (ISO string).
    """
    now = datetime.now(timezone.utc)
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get(MET_WARNING_URL, params={"limit": 30})
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        log.warning("MET warning fetch failed: %r", exc)
        return []

    active = []
    for w in data:
        valid_to_str = w.get("valid_to", "")
        if not valid_to_str:
            continue
        try:
            valid_to = datetime.fromisoformat(valid_to_str.replace("Z", "+00:00"))
            if valid_to.tzinfo is None:
                valid_to = valid_to.replace(tzinfo=timezone.utc)
            if valid_to > now:
                issue = w.get("warning_issue", {})
                active.append({
                    "title":      issue.get("title_en", ""),
                    "heading":    w.get("heading_en", ""),
                    "text":       w.get("text_en", ""),
                    "valid_until": valid_to_str,
                })
        except Exception:
            continue

    return active


# ---------------------------------------------------------------------------
# District forecast
# ---------------------------------------------------------------------------

async def get_district_forecast(
    district_name: str,
    target_datetime: datetime,
) -> Optional[dict]:
    """
    Return MET Malaysia district forecast for the given district + datetime.

    Returns dict:
        status       — "green" | "yellow" | "red"
        description  — English condition text
        emoji        — condition emoji
        bm_text      — original Bahasa Melayu forecast text
        location     — matched MET location name
        min_temp     — int °C
        max_temp     — int °C
        period       — "morning" | "afternoon" | "night"
    Returns None if district not found.
    """
    if not district_name:
        return None

    # Convert UTC ETA to Malaysia time (UTC+8) for period selection
    local_hour = (target_datetime.hour + 8) % 24
    period_key = _period(local_hour)
    target_date_str = str(target_datetime.date())

    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get(
                MET_FORECAST_URL,
                params={
                    "contains": f"{district_name}@location__location_name",
                    "limit": 10,
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        log.warning("MET forecast fetch for '%s' failed: %r", district_name, exc)
        return None

    if not data:
        return None

    # Find today's forecast, fallback to nearest date
    today_rows = [r for r in data if r.get("date") == target_date_str]
    row = today_rows[0] if today_rows else sorted(data, key=lambda r: r.get("date", ""))[0]

    bm_text = row.get(period_key) or row.get("summary_forecast", "")
    status, desc, emoji = BM_MAP.get(bm_text, ("green", "Clear", "☀️"))

    return {
        "status":      status,
        "description": desc,
        "emoji":       emoji,
        "bm_text":     bm_text,
        "location":    row.get("location", {}).get("location_name", district_name),
        "min_temp":    row.get("min_temp"),
        "max_temp":    row.get("max_temp"),
        "period":      period_key.replace("_forecast", ""),
    }
