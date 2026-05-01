from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    google_maps_api_key: str = ""      # Routes API + Maps JS + Places
    xweather_client_id: str = ""       # xweather.com — road weather
    xweather_client_secret: str = ""   # xweather.com — road weather
    meteoblue_api_key: str = ""        # meteoblue.com — high-res model
    tomorrow_api_key: str = ""         # tomorrow.io — 500 calls/day free
    weatherapi_key: str = ""           # weatherapi.com — 1M calls/month free
    cors_origins: List[str] = ["http://localhost:3000"]

    class Config:
        env_file = ".env"


settings = Settings()
