from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import GeneratedVideo, Persona, ReferenceImage, User, VideoGenerationTask
from app.schemas import (
    GenerateFromPersonaIn,
    GenerateFromPromptIn,
    GenerateFromReferenceImagesIn,
    VideoTaskOut,
)
from app.services.kling import KlingApiError, KlingRuntimeConfig, KlingTaskType, sync_kling_task_result
from app.services.kling_config import get_kling_config
from app.services.persona_photos import build_persona_media_bundle
from app.services.persona_voice_kling import ensure_persona_kling_voice
from app.services.video_generation import generate_video, generate_video_from_persona
from app.utils import utc_now

router = APIRouter(prefix="/videos", tags=["videos"])


def _video_params(body: GenerateFromPromptIn, *, kling_task_type: str | None = None) -> dict[str, Any]:
    params: dict[str, Any] = {
        "duration": body.duration or 8,
        "resolution": body.resolution or "720p",
        "aspectRatio": body.aspect_ratio or "16:9",
        "sound": body.sound,
        "provider": "kling",
    }
    if kling_task_type:
        params["klingTaskType"] = kling_task_type
    return params


def _get_kling_task_type(task: VideoGenerationTask) -> KlingTaskType:
    params = task.video_params or {}
    task_type = params.get("klingTaskType", "text2video")
    if task_type in {"text2video", "image2video", "multi-image2video"}:
        return task_type
    if task.mode == "reference_image":
        refs = task.reference_image_keys or []
        return "multi-image2video" if isinstance(refs, list) and len(refs) > 1 else "image2video"
    return "text2video"


async def _apply_kling_result(db: AsyncSession, task: VideoGenerationTask, result: dict[str, Any]) -> None:
    task.status = result["status"]
    task.error_message = result.get("error_message")
    if result.get("generated_video_url"):
        task.generated_video_url = result["generated_video_url"]
        task.generated_video_key = result.get("generated_video_key")
    if result["status"] in {"completed", "failed"}:
        task.completed_at = utc_now()
    task.updated_at = utc_now()

    if result["status"] == "completed" and result.get("generated_video_url"):
        existing = await db.execute(
            select(GeneratedVideo).where(GeneratedVideo.task_id == task.id)
        )
        if existing.scalar_one_or_none() is None:
            params = task.video_params or {}
            db.add(
                GeneratedVideo(
                    task_id=task.id,
                    user_id=task.user_id,
                    video_key=result.get("generated_video_key") or f"kling-{task.id}",
                    video_url=result["generated_video_url"],
                    duration=int(params.get("duration", 5)),
                    resolution=params.get("resolution"),
                    aspect_ratio=params.get("aspectRatio"),
                    title=f"Kling #{task.id}",
                )
            )


async def _sync_task_if_needed(db: AsyncSession, task: VideoGenerationTask) -> None:
    if task.status not in {"pending", "processing"} or not task.gemini_operation_name:
        return
    try:
        config = KlingRuntimeConfig.from_kling_config(await get_kling_config(db, task.user_id))
        result = await sync_kling_task_result(
            config,
            _get_kling_task_type(task),
            task.gemini_operation_name,
        )
        await _apply_kling_result(db, task, result)
        await db.commit()
        await db.refresh(task)
    except KlingApiError as exc:
        print(f"[Kling] Sync task #{task.id} failed: {exc}")


@router.post("/generate/prompt", response_model=VideoTaskOut)
async def generate_from_prompt(
    body: GenerateFromPromptIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoGenerationTask:
    runtime = KlingRuntimeConfig.from_kling_config(await get_kling_config(db, user.id))
    try:
        result = await generate_video(
            runtime,
            prompt=body.prompt,
            duration=body.duration,
            resolution=body.resolution,
            aspect_ratio=body.aspect_ratio,
            enable_sound=body.sound,
        )
    except KlingApiError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    task = VideoGenerationTask(
        user_id=user.id,
        mode="prompt",
        prompt=body.prompt,
        video_params=_video_params(body, kling_task_type=result["task_type"]),
        gemini_operation_name=result["operation_name"],
        status="processing",
        started_at=utc_now(),
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.post("/generate/reference-images", response_model=VideoTaskOut)
async def generate_from_reference_images(
    body: GenerateFromReferenceImagesIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoGenerationTask:
    runtime = KlingRuntimeConfig.from_kling_config(await get_kling_config(db, user.id))
    try:
        result = await generate_video(
            runtime,
            prompt=body.prompt,
            reference_image_urls=body.reference_image_urls,
            duration=body.duration,
            resolution=body.resolution,
            aspect_ratio=body.aspect_ratio,
            enable_sound=body.sound,
        )
    except (KlingApiError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    task = VideoGenerationTask(
        user_id=user.id,
        mode="reference_image",
        prompt=body.prompt,
        reference_image_keys=body.reference_image_urls,
        video_params=_video_params(body, kling_task_type=result["task_type"]),
        gemini_operation_name=result["operation_name"],
        status="processing",
        started_at=utc_now(),
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.post("/generate/persona", response_model=VideoTaskOut)
async def generate_from_persona(
    body: GenerateFromPersonaIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoGenerationTask:
    persona_result = await db.execute(select(Persona).where(Persona.id == body.persona_id))
    persona = persona_result.scalar_one_or_none()
    if not persona or persona.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Persona not found")

    images_result = await db.execute(
        select(ReferenceImage).where(ReferenceImage.persona_id == body.persona_id)
    )
    reference_images = list(images_result.scalars().all())
    media = build_persona_media_bundle(persona, reference_images)

    runtime = KlingRuntimeConfig.from_kling_config(await get_kling_config(db, user.id))
    voice_kling_id = (
        await ensure_persona_kling_voice(persona, runtime, db=db)
        if body.sound
        else None
    )
    try:
        result = await generate_video_from_persona(
            runtime,
            persona_name=persona.name,
            persona_description=persona.description or "",
            personality_traits=persona.personality or "",
            voice_style=persona.voice_style or "",
            voice_tone=persona.voice_tone,
            voice_sample_description=persona.voice_sample_description,
            voice_kling_id=voice_kling_id,
            background_story=persona.background_story or "",
            self_introduction=persona.self_introduction or "",
            douyin_profile_url=persona.douyin_profile_url or "",
            reference_image_urls=media["reference_image_urls"],
            reference_image_keys=media["reference_image_keys"],
            user_prompt=body.user_prompt,
            duration=body.duration,
            resolution=body.resolution,
            aspect_ratio=body.aspect_ratio,
            enable_sound=body.sound,
            expression_tone=media["expression_tone"],
            expression_notes=media["expression_notes"],
            reference_expression_hint=media["reference_expression_hint"],
            protagonist_reference_hint=media["protagonist_reference_hint"],
            body_profile_hint=media.get("body_profile_hint"),
            pose_orientation_hint=media.get("pose_orientation_hint"),
            face_identity_hint=media.get("face_identity_hint"),
        )
    except (KlingApiError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    task = VideoGenerationTask(
        user_id=user.id,
        persona_id=body.persona_id,
        mode="persona_agent",
        prompt=body.user_prompt or "",
        expanded_prompt=result["expanded_prompt"],
        reference_image_keys=media["reference_image_keys"],
        video_params=_video_params(body, kling_task_type=result["task_type"]),
        gemini_operation_name=result["operation_name"],
        status="processing",
        started_at=utc_now(),
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.get("/tasks/{task_id}", response_model=VideoTaskOut)
async def get_task(
    task_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoGenerationTask:
    task = await _get_owned_task(db, task_id, user.id)
    await _sync_task_if_needed(db, task)
    return task


@router.get("/tasks", response_model=list[VideoTaskOut])
async def list_tasks(
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[VideoGenerationTask]:
    result = await db.execute(
        select(VideoGenerationTask)
        .where(VideoGenerationTask.user_id == user.id)
        .order_by(VideoGenerationTask.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    tasks = list(result.scalars().all())
    for task in tasks:
        if task.status in {"pending", "processing"}:
            await _sync_task_if_needed(db, task)
    return tasks


@router.post("/tasks/{task_id}/cancel", response_model=VideoTaskOut)
async def cancel_task(
    task_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoGenerationTask:
    task = await _get_owned_task(db, task_id, user.id)
    if task.status in {"completed", "failed"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot cancel finished task")
    task.status = "failed"
    task.error_message = "Cancelled by user"
    task.completed_at = utc_now()
    await db.commit()
    await db.refresh(task)
    return task


async def _get_owned_task(db: AsyncSession, task_id: int, user_id: int) -> VideoGenerationTask:
    result = await db.execute(select(VideoGenerationTask).where(VideoGenerationTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task or task.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task
