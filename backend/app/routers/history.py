from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import GeneratedVideo, User, VideoGenerationTask
from app.schemas import DownloadUrlOut, GeneratedVideoOut, SuccessOut, VideoMetadataUpdate
from app.services.cos import delete_file, get_signed_url
from app.utils import utc_now

router = APIRouter(prefix="/history", tags=["history"])


@router.get("/videos", response_model=list[GeneratedVideoOut])
async def list_videos(
    persona_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GeneratedVideo]:
    if persona_id is not None:
        result = await db.execute(
            select(GeneratedVideo)
            .join(VideoGenerationTask, GeneratedVideo.task_id == VideoGenerationTask.id)
            .where(
                GeneratedVideo.user_id == user.id,
                VideoGenerationTask.persona_id == persona_id,
            )
            .order_by(GeneratedVideo.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    else:
        result = await db.execute(
            select(GeneratedVideo)
            .where(GeneratedVideo.user_id == user.id)
            .order_by(GeneratedVideo.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    return list(result.scalars().all())


@router.patch("/videos/{video_id}/favorite", response_model=GeneratedVideoOut)
async def toggle_favorite(
    video_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GeneratedVideo:
    video = await _get_owned_video(db, video_id, user.id)
    video.is_favorite = not video.is_favorite
    video.updated_at = utc_now()
    await db.commit()
    await db.refresh(video)
    return video


@router.patch("/videos/{video_id}", response_model=GeneratedVideoOut)
async def update_metadata(
    video_id: int,
    body: VideoMetadataUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GeneratedVideo:
    video = await _get_owned_video(db, video_id, user.id)
    if body.title is not None:
        video.title = body.title
    if body.description is not None:
        video.description = body.description
    video.updated_at = utc_now()
    await db.commit()
    await db.refresh(video)
    return video


@router.delete("/videos/{video_id}", response_model=SuccessOut)
async def delete_video(
    video_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SuccessOut:
    video = await _get_owned_video(db, video_id, user.id)
    try:
        await delete_file(video.video_key)
    except Exception:
        pass
    await db.delete(video)
    await db.commit()
    return SuccessOut()


@router.get("/videos/{video_id}/download-url", response_model=DownloadUrlOut)
async def get_download_url(
    video_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DownloadUrlOut:
    video = await _get_owned_video(db, video_id, user.id)
    url = await get_signed_url(video.video_key)
    return DownloadUrlOut(url=url)


async def _get_owned_video(db: AsyncSession, video_id: int, user_id: int) -> GeneratedVideo:
    result = await db.execute(select(GeneratedVideo).where(GeneratedVideo.id == video_id))
    video = result.scalar_one_or_none()
    if not video or video.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    return video
