from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings
from app.routers.weather_route import router

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="RedahLuhh API",
    description="Smart Route Weather Tracker — ride without doubt 🏍️",
    version="1.0.0-alpha",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — frontend origin only; API keys never leave the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(router)


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok", "service": "RedahLuhh API v1-alpha"}
