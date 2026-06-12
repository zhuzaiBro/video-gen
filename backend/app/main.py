from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

_backend_dir = Path(__file__).resolve().parents[1]
_root_dir = _backend_dir.parent
# 先加载 backend/.env，再以项目根 .env 覆盖（避免空值 backend/.env 冲掉根目录配置）
load_dotenv(_backend_dir / ".env")
load_dotenv(_root_dir / ".env", override=True)

from app.config import settings
from app.routers import auth_routes, history, personas, scripts, settings_routes, videos

app = FastAPI(title="Gemini Digital Human Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router, prefix="/api")
app.include_router(personas.router, prefix="/api")
app.include_router(videos.router, prefix="/api")
app.include_router(history.router, prefix="/api")
app.include_router(scripts.router, prefix="/api")
app.include_router(settings_routes.router, prefix="/api")


@app.get("/api/health")
async def health() -> dict[str, bool]:
    from app.services.cos import _resolve_cos_config

    cfg = _resolve_cos_config()
    return {
        "ok": True,
        "cosConfigured": bool(cfg["secret_id"] and cfg["secret_key"] and cfg["bucket"]),
    }
