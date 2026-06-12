from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import Persona, ReferenceImage, User
from app.schemas import (
    PersonaCreate,
    PersonaDetailOut,
    PersonaImageConfirmIn,
    PersonaImagePresignIn,
    PersonaImagePresignOut,
    PersonaOut,
    PersonaUpdate,
    PersonaVoiceSampleOut,
    ReferenceImageOut,
    ReferenceImageUpdateIn,
    SuccessOut,
)
from app.services.cos import (
    CosNotConfiguredError,
    create_persona_upload_credentials,
    create_persona_voice_upload_credentials,
    delete_file,
    object_exists,
    public_url,
)
from app.services.kling import KlingApiError, KlingRuntimeConfig, register_custom_voice
from app.services.kling_config import get_kling_config
from app.services.persona_extract import PersonaExtractError, delete_reference_extract_assets, extract_digital_human_assets
from app.services.persona_photos import (
    pick_reference_image_by_shot,
    sort_reference_images_for_kling,
)
from app.services.voice_sample import (
    VoiceSampleError,
    analyze_voice_sample_url,
    ensure_kling_compatible_voice,
    fallback_voice_description,
)
from app.utils import utc_now

router = APIRouter(prefix="/personas", tags=["personas"])

ALLOWED_SHOT_TYPES = frozenset({"front_face", "side_face", "body", "other"})
ALLOWED_PHOTO_EXPRESSIONS = frozenset({"neutral", "slight_smile", "calm", "focused"})


def _normalize_shot_type(value: str | None) -> str:
    shot = (value or "other").strip()
    return shot if shot in ALLOWED_SHOT_TYPES else "other"


def _normalize_photo_expression(value: str | None) -> str:
    expr = (value or "neutral").strip()
    return expr if expr in ALLOWED_PHOTO_EXPRESSIONS else "neutral"


def _sync_persona_cover_image(persona: Persona) -> None:
    images = list(persona.reference_images)
    if not images:
        return
    cover = pick_reference_image_by_shot(images, "front_face") or sort_reference_images_for_kling(images)[0]
    persona.reference_image_key = cover.image_key
    persona.reference_image_url = cover.image_url


def _persona_detail(persona: Persona) -> dict:
    return {
        **PersonaOut.model_validate(persona).model_dump(by_alias=True),
        "referenceImages": [
            ReferenceImageOut.model_validate(img).model_dump(by_alias=True)
            for img in persona.reference_images
        ],
    }


@router.post("", response_model=PersonaOut, status_code=status.HTTP_201_CREATED)
async def create_persona(
    body: PersonaCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Persona:
    persona = Persona(
        user_id=user.id,
        name=body.name,
        description=body.description,
        personality=body.personality,
        voice_style=body.voice_style,
        voice_tone=body.voice_tone,
        background_story=body.background_story,
        self_introduction=body.self_introduction,
        douyin_profile_url=body.douyin_profile_url,
        expression_tone=body.expression_tone or "subtle_natural",
        expression_notes=body.expression_notes,
        height_cm=body.height_cm,
        weight_kg=body.weight_kg,
    )
    db.add(persona)
    await db.commit()
    await db.refresh(persona)
    return persona


@router.get("", response_model=list[PersonaDetailOut])
async def list_personas(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(Persona)
        .where(Persona.user_id == user.id)
        .options(selectinload(Persona.reference_images))
        .order_by(Persona.created_at.desc())
    )
    return [_persona_detail(persona) for persona in result.scalars().all()]


@router.get("/{persona_id}", response_model=PersonaDetailOut)
async def get_persona(
    persona_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    persona = await _get_owned_persona(db, persona_id, user.id, load_images=True)
    return _persona_detail(persona)


@router.patch("/{persona_id}", response_model=PersonaOut)
async def update_persona(
    persona_id: int,
    body: PersonaUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Persona:
    persona = await _get_owned_persona(db, persona_id, user.id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(persona, field, value)
    persona.updated_at = utc_now()
    await db.commit()
    await db.refresh(persona)
    return persona


@router.delete("/{persona_id}", response_model=SuccessOut)
async def delete_persona(
    persona_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SuccessOut:
    persona = await _get_owned_persona(db, persona_id, user.id, load_images=True)
    for image in persona.reference_images:
        try:
            await delete_file(image.image_key)
        except Exception:
            pass
        await delete_reference_extract_assets(image)
    if persona.voice_sample_key:
        try:
            await delete_file(persona.voice_sample_key)
        except Exception:
            pass
    await db.delete(persona)
    await db.commit()
    return SuccessOut()


async def _register_reference_image(
    db: AsyncSession,
    persona: Persona,
    *,
    image_key: str,
    image_url: str,
    shot_type: str = "other",
    expression: str = "neutral",
) -> ReferenceImage:
    image = ReferenceImage(
        persona_id=persona.id,
        image_key=image_key,
        image_url=image_url,
        shot_type=_normalize_shot_type(shot_type),
        expression=_normalize_photo_expression(expression),
    )
    db.add(image)
    await db.flush()
    await db.refresh(persona, attribute_names=["reference_images"])
    _sync_persona_cover_image(persona)
    persona.updated_at = utc_now()

    await db.commit()
    await db.refresh(image)
    return image


@router.post("/{persona_id}/reference-images/presign", response_model=PersonaImagePresignOut)
async def presign_persona_reference_image(
    persona_id: int,
    body: PersonaImagePresignIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    persona = await _get_owned_persona(db, persona_id, user.id, load_images=True)
    if len(persona.reference_images) >= 12:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="最多上传 12 张照片")

    try:
        credentials = await create_persona_upload_credentials(
            persona.id,
            body.filename,
            content_type=body.content_type,
        )
    except CosNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return credentials


@router.post("/{persona_id}/reference-images/confirm", response_model=ReferenceImageOut)
async def confirm_persona_reference_image(
    persona_id: int,
    body: PersonaImageConfirmIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReferenceImage:
    persona = await _get_owned_persona(db, persona_id, user.id, load_images=True)
    if len(persona.reference_images) >= 12:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="最多上传 12 张照片")

    expected_prefix = f"personas/{persona.id}/"
    if not body.key.startswith(expected_prefix):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的对象 Key")

    existing = await db.execute(
        select(ReferenceImage).where(ReferenceImage.image_key == body.key)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该照片已存在")

    try:
        if not await object_exists(body.key):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="COS 上未找到已上传的文件")
    except CosNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return await _register_reference_image(
        db,
        persona,
        image_key=body.key,
        image_url=public_url(body.key),
        shot_type=body.shot_type,
        expression=body.expression,
    )


@router.post(
    "/{persona_id}/reference-images/{image_id}/extract-digital-assets",
    response_model=ReferenceImageOut,
)
async def extract_persona_reference_digital_assets(
    persona_id: int,
    image_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReferenceImage:
    await _get_owned_persona(db, persona_id, user.id)
    result = await db.execute(
        select(ReferenceImage).where(
            ReferenceImage.id == image_id,
            ReferenceImage.persona_id == persona_id,
        )
    )
    image = result.scalar_one_or_none()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="照片不存在")

    try:
        await extract_digital_human_assets(image)
    except PersonaExtractError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    persona = await _get_owned_persona(db, persona_id, user.id, load_images=True)
    persona.updated_at = utc_now()
    await db.commit()
    await db.refresh(image)
    return image


@router.post("/{persona_id}/extract-all-digital-assets", response_model=list[ReferenceImageOut])
async def extract_all_persona_digital_assets(
    persona_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ReferenceImage]:
    persona = await _get_owned_persona(db, persona_id, user.id, load_images=True)
    if not persona.reference_images:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请先上传照片")

    updated: list[ReferenceImage] = []
    errors: list[str] = []
    for image in persona.reference_images:
        try:
            await extract_digital_human_assets(image)
            updated.append(image)
        except PersonaExtractError as exc:
            errors.append(f"照片 #{image.id}: {exc}")

    if not updated:
        detail = errors[0] if len(errors) == 1 else "；".join(errors[:3])
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail or "提取失败")

    persona.updated_at = utc_now()
    await db.commit()
    for image in updated:
        await db.refresh(image)
    return updated


@router.patch("/reference-images/{image_id}", response_model=ReferenceImageOut)
async def update_persona_reference_image(
    image_id: int,
    body: ReferenceImageUpdateIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReferenceImage:
    result = await db.execute(select(ReferenceImage).where(ReferenceImage.id == image_id))
    image = result.scalar_one_or_none()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="照片不存在")

    persona = await _get_owned_persona(db, image.persona_id, user.id, load_images=True)
    if body.shot_type is not None:
        image.shot_type = _normalize_shot_type(body.shot_type)
    if body.expression is not None:
        image.expression = _normalize_photo_expression(body.expression)
    _sync_persona_cover_image(persona)
    persona.updated_at = utc_now()
    await db.commit()
    await db.refresh(image)
    return image


@router.post("/{persona_id}/voice-sample/presign", response_model=PersonaImagePresignOut)
async def presign_persona_voice_sample(
    persona_id: int,
    body: PersonaImagePresignIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    persona = await _get_owned_persona(db, persona_id, user.id)
    try:
        credentials = await create_persona_voice_upload_credentials(
            persona.id,
            body.filename,
            content_type=body.content_type,
        )
    except CosNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return credentials


@router.post("/{persona_id}/voice-sample/confirm", response_model=PersonaVoiceSampleOut)
async def confirm_persona_voice_sample(
    persona_id: int,
    body: PersonaImageConfirmIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PersonaVoiceSampleOut:
    persona = await _get_owned_persona(db, persona_id, user.id)
    expected_prefix = f"personas/{persona.id}/voice-"
    if not body.key.startswith(expected_prefix):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的对象 Key")

    try:
        if not await object_exists(body.key):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="COS 上未找到已上传的文件")
    except CosNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if persona.voice_sample_key and persona.voice_sample_key != body.key:
        try:
            await delete_file(persona.voice_sample_key)
        except Exception:
            pass

    sample_url = public_url(body.key)
    try:
        description = await analyze_voice_sample_url(sample_url)
    except VoiceSampleError:
        description = fallback_voice_description()

    persona.voice_sample_key = body.key
    persona.voice_sample_url = sample_url
    persona.voice_sample_description = description
    persona.voice_tone = "custom_sample"
    persona.voice_sample_kling_id = None
    persona.updated_at = utc_now()
    await db.commit()
    await db.refresh(persona)

    kling_voice_id: str | None = None
    kling_voice_error: str | None = None
    kling_config = await get_kling_config(db, user.id)
    runtime = KlingRuntimeConfig.from_kling_config(kling_config)
    try:
        runtime.require_credentials()
        kling_url = sample_url
        kling_key = body.key
        try:
            kling_url, kling_key, converted = await ensure_kling_compatible_voice(
                persona_id=persona.id,
                sample_url=sample_url,
                sample_key=body.key,
            )
            if converted and kling_key != body.key:
                try:
                    await delete_file(body.key)
                except Exception:
                    pass
                persona.voice_sample_key = kling_key
                persona.voice_sample_url = kling_url
                persona.updated_at = utc_now()
                await db.commit()
                sample_url = kling_url
        except VoiceSampleError as exc:
            kling_voice_error = str(exc)
        else:
            kling_voice_id = await register_custom_voice(
                runtime,
                voice_name=persona.name,
                voice_url=kling_url,
            )
            persona.voice_sample_kling_id = kling_voice_id
            persona.updated_at = utc_now()
            await db.commit()
    except KlingApiError as exc:
        kling_voice_error = str(exc)

    return PersonaVoiceSampleOut(
        key=persona.voice_sample_key or body.key,
        url=persona.voice_sample_url or sample_url,
        description=description,
        kling_voice_id=kling_voice_id,
        kling_voice_error=kling_voice_error,
    )


@router.delete("/{persona_id}/voice-sample", response_model=SuccessOut)
async def delete_persona_voice_sample(
    persona_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SuccessOut:
    persona = await _get_owned_persona(db, persona_id, user.id)
    if persona.voice_sample_key:
        try:
            await delete_file(persona.voice_sample_key)
        except Exception:
            pass
    persona.voice_sample_key = None
    persona.voice_sample_url = None
    persona.voice_sample_description = None
    persona.voice_sample_kling_id = None
    if persona.voice_tone == "custom_sample":
        persona.voice_tone = "douyin_host"
    persona.updated_at = utc_now()
    await db.commit()
    return SuccessOut()


@router.delete("/reference-images/{image_id}", response_model=SuccessOut)
async def delete_persona_reference_image(
    image_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SuccessOut:
    result = await db.execute(select(ReferenceImage).where(ReferenceImage.id == image_id))
    image = result.scalar_one_or_none()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    persona = await _get_owned_persona(db, image.persona_id, user.id, load_images=True)
    try:
        await delete_file(image.image_key)
    except Exception:
        pass
    await delete_reference_extract_assets(image)
    await db.delete(image)
    await db.flush()
    await db.refresh(persona, attribute_names=["reference_images"])
    if persona.reference_images:
        _sync_persona_cover_image(persona)
    else:
        persona.reference_image_key = None
        persona.reference_image_url = None
    persona.updated_at = utc_now()

    await db.commit()
    return SuccessOut()


async def _get_owned_persona(
    db: AsyncSession,
    persona_id: int,
    user_id: int,
    *,
    load_images: bool = False,
) -> Persona:
    query = select(Persona).where(Persona.id == persona_id)
    if load_images:
        query = query.options(selectinload(Persona.reference_images))
    result = await db.execute(query)
    persona = result.scalar_one_or_none()
    if not persona or persona.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Persona not found")
    return persona
