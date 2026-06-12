from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import KlingSettings as KlingSettingsRow

KLING_DEFAULT_API_BASE_URL = "https://api-beijing.klingai.com"
LEGACY_KLING_API_BASE_URL = "https://api.klingai.com"
KLING_DEFAULT_MODEL_NAME = "kling-v3"
KLING_MODEL_OPTIONS = ("kling-v3", "kling-v3-omni")


def normalize_api_base_url(url: str | None) -> str:
    base = (url or KLING_DEFAULT_API_BASE_URL).strip().rstrip("/")
    if base == LEGACY_KLING_API_BASE_URL:
        return KLING_DEFAULT_API_BASE_URL
    return base or KLING_DEFAULT_API_BASE_URL


def normalize_model_name(model: str | None, api_base_url: str | None = None) -> str:
    name = (model or KLING_DEFAULT_MODEL_NAME).strip()
    base = normalize_api_base_url(api_base_url)
    if name in KLING_MODEL_OPTIONS:
        return name
    if base == KLING_DEFAULT_API_BASE_URL and (name == "kling-v2-6" or name.startswith("kling-v2")):
        return KLING_DEFAULT_MODEL_NAME
    return name or KLING_DEFAULT_MODEL_NAME


@dataclass(frozen=True)
class KlingConfig:
    access_key: str
    secret_key: str
    api_base_url: str
    model_name: str
    default_mode: str
    source: str  # "database" | "environment" | "mixed"

    @property
    def configured(self) -> bool:
        return bool(self.access_key and self.secret_key)


def _from_env() -> KlingConfig:
    api_base_url = normalize_api_base_url(settings.kling_api_base_url)
    return KlingConfig(
        access_key=settings.kling_access_key,
        secret_key=settings.kling_secret_key,
        api_base_url=api_base_url,
        model_name=normalize_model_name(settings.kling_model_name, api_base_url),
        default_mode=settings.kling_default_mode or "std",
        source="environment",
    )


def _from_row(row: KlingSettingsRow) -> KlingConfig:
    api_base_url = normalize_api_base_url(row.api_base_url)
    return KlingConfig(
        access_key=row.access_key,
        secret_key=row.secret_key,
        api_base_url=api_base_url,
        model_name=normalize_model_name(row.model_name, api_base_url),
        default_mode=row.default_mode or "std",
        source="database",
    )


def _merge(row: KlingSettingsRow | None, env: KlingConfig) -> KlingConfig:
    if row is None:
        return env
    db_config = _from_row(row)
    if db_config.configured:
        return db_config
    return KlingConfig(
        access_key=db_config.access_key or env.access_key,
        secret_key=db_config.secret_key or env.secret_key,
        api_base_url=db_config.api_base_url or env.api_base_url,
        model_name=normalize_model_name(db_config.model_name or env.model_name, db_config.api_base_url or env.api_base_url),
        default_mode=db_config.default_mode or env.default_mode,
        source="mixed" if env.configured else "database",
    )


async def get_kling_config(db: AsyncSession, user_id: int) -> KlingConfig:
    result = await db.execute(select(KlingSettingsRow).where(KlingSettingsRow.user_id == user_id))
    row = result.scalar_one_or_none()
    return _merge(row, _from_env())


async def get_kling_settings_row(db: AsyncSession, user_id: int) -> KlingSettingsRow | None:
    result = await db.execute(select(KlingSettingsRow).where(KlingSettingsRow.user_id == user_id))
    return result.scalar_one_or_none()


def mask_secret(secret: str) -> str | None:
    if not secret:
        return None
    if len(secret) <= 4:
        return "****"
    return f"{'*' * (len(secret) - 4)}{secret[-4:]}"
