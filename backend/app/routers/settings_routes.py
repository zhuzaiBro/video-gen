from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import KlingSettings as KlingSettingsRow
from app.models import User
from app.schemas import KlingSettingsOut, KlingSettingsUpdate, SuccessOut
from app.services.kling import KlingApiError, KlingRuntimeConfig, test_kling_connection
from app.services.kling_config import (
    KLING_DEFAULT_API_BASE_URL,
    KLING_DEFAULT_MODEL_NAME,
    get_kling_config,
    get_kling_settings_row,
    mask_secret,
    normalize_api_base_url,
    normalize_model_name,
)
from app.utils import utc_now

router = APIRouter(prefix="/settings", tags=["settings"])


def _to_out(row: KlingSettingsRow | None, effective) -> KlingSettingsOut:
    access_key = row.access_key if row and row.access_key else effective.access_key
    secret_value = row.secret_key if row and row.secret_key else effective.secret_key
    return KlingSettingsOut(
        access_key=access_key,
        has_secret_key=bool(secret_value),
        secret_key_masked=mask_secret(secret_value) if secret_value else None,
        api_base_url=effective.api_base_url,
        model_name=effective.model_name,
        default_mode=(row.default_mode if row and row.default_mode else None) or effective.default_mode,
        configured=effective.configured,
        configured_via=effective.source if effective.configured else "none",
    )


@router.get("/kling", response_model=KlingSettingsOut)
async def get_kling_settings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> KlingSettingsOut:
    row = await get_kling_settings_row(db, user.id)
    effective = await get_kling_config(db, user.id)
    return _to_out(row, effective)


@router.put("/kling", response_model=KlingSettingsOut)
async def update_kling_settings(
    body: KlingSettingsUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> KlingSettingsOut:
    row = await get_kling_settings_row(db, user.id)
    if row is None:
        row = KlingSettingsRow(user_id=user.id)
        db.add(row)

    if body.access_key is not None:
        row.access_key = body.access_key.strip()
    if body.api_base_url is not None:
        row.api_base_url = normalize_api_base_url(body.api_base_url.strip() or KLING_DEFAULT_API_BASE_URL)
    if body.model_name is not None:
        row.model_name = normalize_model_name(
            body.model_name.strip() or KLING_DEFAULT_MODEL_NAME,
            row.api_base_url or KLING_DEFAULT_API_BASE_URL,
        )
    if body.default_mode is not None:
        row.default_mode = body.default_mode.strip() or "std"
    if body.secret_key is not None:
        secret = body.secret_key.strip()
        if secret:
            row.secret_key = secret

    row.updated_at = utc_now()
    await db.commit()
    await db.refresh(row)

    effective = await get_kling_config(db, user.id)
    return _to_out(row, effective)


@router.post("/kling/test", response_model=SuccessOut)
async def test_kling_settings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SuccessOut:
    config = await get_kling_config(db, user.id)
    runtime = KlingRuntimeConfig.from_kling_config(config)
    try:
        await test_kling_connection(runtime)
    except KlingApiError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return SuccessOut()
