from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    google_maps_api_key: str = ""   # Routes API + Maps JS + Places
    weatherapi_key: str = ""        # weatherapi.com — free, 1M calls/month
    tomorrow_api_key: str = ""      # tomorrow.io — free, 500 calls/day
    cors_origins: List[str] = ["http://localhost:3000"]

    class Config:
        env_file = ".env"


settings = Settings()
