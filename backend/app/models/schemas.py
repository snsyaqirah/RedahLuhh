import re
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, field_validator


class RouteWeatherRequest(BaseModel):
    origin: str
    destination: str
    departure_time: Optional[datetime] = None

    @field_validator("origin", "destination")
    @classmethod
    def validate_location(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Location must be at least 2 characters")
        if len(v) > 300:
            raise ValueError("Location must be at most 300 characters")
        if re.search(r"[<>{}|\\^`]", v):
            raise ValueError("Location contains invalid characters")
        return v


class WeatherCondition(BaseModel):
    status: str          # "green" | "yellow" | "red"
    label: str           # "Safe" | "Caution" | "Danger"
    description: str
    temperature: float
    feels_like: float
    humidity: int
    wind_speed: float
    precipitation_prob: float   # 0.0 – 1.0
    weather_code: int
    icon_code: str              # OpenWeatherMap icon code e.g. "10d"


class Waypoint(BaseModel):
    index: int
    lat: float
    lng: float
    label: str
    eta: datetime
    distance_from_start_km: float
    weather: WeatherCondition


class RouteInfo(BaseModel):
    total_distance_km: float
    total_duration_minutes: int
    encoded_polyline: str


class RouteWeatherResponse(BaseModel):
    route_index: int = 0          # 0 = primary route from Google
    route_label: str = "Route"   # "Driest Route" | "Fastest Route" | "Alternative Route"
    is_recommended: bool = False
    weather_score: float = 0.0   # lower = better (green=0, yellow=1, red=3 per waypoint)
    route: RouteInfo
    waypoints: List[Waypoint]
    overall_status: str    # "green" | "yellow" | "red"
    overall_label: str     # "Safe to Ride" | "Ride with Caution" | "Not Safe to Ride"
    summary: str
    alerts: List[str]
    met_warnings: List[str] = []   # active MET Malaysia official warnings
    departure_time: datetime
    last_updated: datetime


class MultiRouteWeatherResponse(BaseModel):
    routes: List[RouteWeatherResponse]
    recommended_index: int = 0
