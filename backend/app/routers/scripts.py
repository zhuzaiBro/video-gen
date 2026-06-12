import asyncio
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db, session_factory
from app.models import Persona, ReferenceImage, TechTopicSearch, User, VideoGenerationTask, VideoScript
from app.schemas import (
    ScriptAssembleIn,
    ScriptAssembleOut,
    ScriptGenerateAllOut,
    ScriptGenerateVideoEstimateOut,
    ScriptGenerateVideoIn,
    ScriptSegmentGenerateIn,
    ScriptSegmentOut,
    ScriptSegmentPrepareFrameIn,
    ScriptSegmentPrepareFrameOut,
    ScriptFromMarkdownIn,
    ScriptSegmentUpdateIn,
    ScriptSegmentsOut,
    PersonaImagePresignIn,
    PersonaImagePresignOut,
    TechScriptFromTopicIn,
    TechTopicSearchIn,
    TechTopicSearchOut,
    TechTopicSearchRecordOut,
    TechTopicOut,
    VideoScriptAnalyzeIn,
    VideoScriptOut,
    VideoScriptUpdate,
    VideoTaskOut,
)
from app.services.cos import CosNotConfiguredError, create_script_artboard_upload_credentials
from app.services.kling import KlingApiError, KlingRuntimeConfig
from app.services.kling_config import get_kling_config
from app.services.script_extraction import run_script_analysis
from app.services.script_from_markdown import _slug_from_title, run_script_from_markdown
from app.services.script_from_topic import run_script_from_topic
from app.services.tech_topics import TechTopicError, search_hot_tech_topics
from app.services.qwen import QwenError
from app.services.script_polish import ScriptPolishError, polish_decomposed_script
from app.services.script_prompt import (
    build_user_prompt_from_script,
    estimate_generation_minutes,
    infer_script_duration_seconds,
    max_kling_duration_seconds,
    min_kling_duration_seconds,
    recommend_kling_duration,
)
from app.services.script_segments import (
    append_artboard_generation_constraints,
    build_segment_prompt,
    clamp_kling_duration,
    get_assembled_video,
    get_excluded_segment_indexes,
    get_prepared_frame,
    get_segment_first_frame_config,
    get_segment_artboard_layers_map,
    get_segment_aspect_overrides,
    get_segment_tasks,
    merge_prepared_frame,
    normalize_artboard_layers,
    parse_script_segments,
    previous_segment_in_order,
    resolve_persona_reference_images,
    resolve_segment_aspect_ratio,
    resolve_segment_duration_sec,
    resolve_segment_order,
    suggest_segment_artboard_layers,
    segment_artboard_enabled,
)
from app.services.video_assembly import VideoAssemblyError, assemble_videos_from_urls
from app.services.video_frame import VideoFrameError, upload_continuity_frame
from app.services.persona_photos import (
    build_persona_media_bundle,
    describe_protagonist_reference_images,
    face_identity_hint_for_first_screen,
    resolve_face_source_for_first_screen,
    resolve_portrait_for_first_screen,
    resolve_rotated_kling_references,
)
from app.services.image_rotate import normalize_rotation
from app.services.persona_scene import (
    PersonaSceneError,
    prepare_and_validate_segment_frame,
    split_visual_action_and_scene,
)
from app.services.persona_voice_kling import ensure_persona_kling_voice
from app.services.video_generation import generate_video_from_persona
from app.utils import utc_now

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scripts", tags=["scripts"])


def _persona_description_with_body(
    persona: Persona,
    media: dict,
    *,
    portrait=None,
) -> str:
    parts = [(persona.description or "").strip()]
    body_hint = (media.get("body_profile_hint") or "").strip()
    if body_hint:
        parts.append(body_hint)
    face_hint = face_identity_hint_for_first_screen(portrait)
    if face_hint:
        parts.append(face_hint)
    return " ".join(p for p in parts if p)


def _script_to_out(script: VideoScript, *, model_name: str = "kling-v3") -> VideoScriptOut:
    inferred = infer_script_duration_seconds(script)
    max_kling = max_kling_duration_seconds(model_name=model_name)
    recommended = recommend_kling_duration(script, model_name=model_name)
    base = VideoScriptOut.model_validate(script, from_attributes=True)
    return base.model_copy(
        update={
            "script_duration_sec": inferred,
            "recommended_duration_sec": recommended,
            "max_kling_duration_sec": max_kling,
        }
    )


async def _get_kling_model_name(db: AsyncSession, user_id: int) -> str:
    config = await get_kling_config(db, user_id)
    return config.model_name or "kling-v3"


async def _get_owned_script(db: AsyncSession, script_id: int, user_id: int) -> VideoScript:
    result = await db.execute(select(VideoScript).where(VideoScript.id == script_id))
    script = result.scalar_one_or_none()
    if not script or script.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="脚本不存在")
    return script


@router.post("/analyze", response_model=VideoScriptOut, status_code=status.HTTP_201_CREATED)
async def analyze_video_script(
    body: VideoScriptAnalyzeIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoScript:
    source_url = body.source_url.strip()
    if not source_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请提供有效的 http(s) 视频 URL")

    if body.persona_id is not None:
        persona_result = await db.execute(select(Persona).where(Persona.id == body.persona_id))
        persona = persona_result.scalar_one_or_none()
        if not persona or persona.user_id != user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="人设不存在")

    script = VideoScript(
        user_id=user.id,
        persona_id=body.persona_id,
        source_url=source_url,
        status="pending",
    )
    db.add(script)
    await db.commit()
    await db.refresh(script)

    asyncio.create_task(run_script_analysis(script.id))
    model_name = await _get_kling_model_name(db, user.id)
    return _script_to_out(script, model_name=model_name)


async def _get_owned_tech_search(db: AsyncSession, search_id: int, user_id: int) -> TechTopicSearch:
    result = await db.execute(select(TechTopicSearch).where(TechTopicSearch.id == search_id))
    record = result.scalar_one_or_none()
    if not record or record.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="搜索记录不存在")
    return record


def _topics_from_record(record: TechTopicSearch) -> list[TechTopicOut]:
    raw = record.topics if isinstance(record.topics, list) else []
    out: list[TechTopicOut] = []
    for item in raw:
        if isinstance(item, dict):
            try:
                out.append(TechTopicOut.model_validate(item))
            except Exception:
                continue
    return out


def _record_to_out(record: TechTopicSearch) -> TechTopicSearchRecordOut:
    return TechTopicSearchRecordOut(
        id=record.id,
        query=record.query,
        topic_count=record.topic_count,
        topics=_topics_from_record(record),
        created_at=record.created_at,
    )


@router.post("/tech-topics/search", response_model=TechTopicSearchOut)
async def search_tech_topics(
    body: TechTopicSearchIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TechTopicSearchOut:
    try:
        topics = await search_hot_tech_topics(query=body.query, limit=body.limit)
    except TechTopicError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    query_text = body.query.strip() if body.query and body.query.strip() else None
    record = TechTopicSearch(
        user_id=user.id,
        query=query_text,
        topics=topics,
        topic_count=len(topics),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    return TechTopicSearchOut(
        search_record_id=record.id,
        topics=[TechTopicOut.model_validate(t) for t in topics],
    )


@router.get("/tech-topics/history", response_model=list[TechTopicSearchRecordOut])
async def list_tech_topic_search_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 30,
) -> list[TechTopicSearchRecordOut]:
    result = await db.execute(
        select(TechTopicSearch)
        .where(TechTopicSearch.user_id == user.id)
        .order_by(TechTopicSearch.created_at.desc())
        .limit(min(limit, 50))
    )
    return [_record_to_out(row) for row in result.scalars().all()]


@router.get("/tech-topics/history/{search_id}", response_model=TechTopicSearchRecordOut)
async def get_tech_topic_search_record(
    search_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TechTopicSearchRecordOut:
    record = await _get_owned_tech_search(db, search_id, user.id)
    return _record_to_out(record)


@router.delete("/tech-topics/history/{search_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tech_topic_search_record(
    search_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    record = await _get_owned_tech_search(db, search_id, user.id)
    await db.delete(record)
    await db.commit()


@router.post("/from-tech-topic", response_model=VideoScriptOut, status_code=status.HTTP_201_CREATED)
async def create_script_from_tech_topic(
    body: TechScriptFromTopicIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoScript:
    topic = body.topic if isinstance(body.topic, dict) else {}
    title = str(topic.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="话题缺少 title")

    if body.persona_id is not None:
        persona_result = await db.execute(select(Persona).where(Persona.id == body.persona_id))
        persona = persona_result.scalar_one_or_none()
        if not persona or persona.user_id != user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="人设不存在")

    slug = str(topic.get("id") or "topic").strip() or "topic"
    script = VideoScript(
        user_id=user.id,
        persona_id=body.persona_id,
        source_url=f"tech-topic://{slug}",
        platform="tech-topic",
        title=title,
        status="pending",
        extra_metadata={"sourceType": "tech-topic", "topicPreview": topic},
    )
    db.add(script)
    await db.commit()
    await db.refresh(script)

    asyncio.create_task(
        run_script_from_topic(
            script.id,
            topic=topic,
            target_duration_sec=body.target_duration_sec,
            extra_query=body.extra_query,
        )
    )
    model_name = await _get_kling_model_name(db, user.id)
    return _script_to_out(script, model_name=model_name)


@router.post("/from-markdown", response_model=VideoScriptOut, status_code=status.HTTP_201_CREATED)
async def create_script_from_markdown(
    body: ScriptFromMarkdownIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoScript:
    markdown = body.markdown.strip()
    if not markdown:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Markdown 内容不能为空")

    if body.persona_id is not None:
        persona_result = await db.execute(select(Persona).where(Persona.id == body.persona_id))
        persona = persona_result.scalar_one_or_none()
        if not persona or persona.user_id != user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="人设不存在")

    title_hint = (body.title or "").strip() or None
    slug = _slug_from_title(title_hint or markdown[:80])
    script = VideoScript(
        user_id=user.id,
        persona_id=body.persona_id,
        source_url=f"markdown://{slug}",
        platform="markdown",
        title=title_hint or "Markdown 脚本",
        status="pending",
        extra_metadata={"sourceType": "markdown"},
    )
    db.add(script)
    await db.commit()
    await db.refresh(script)

    asyncio.create_task(
        run_script_from_markdown(
            script.id,
            markdown=markdown,
            title_hint=title_hint,
            target_duration_sec=body.target_duration_sec,
            extra_notes=body.extra_notes,
        )
    )
    model_name = await _get_kling_model_name(db, user.id)
    return _script_to_out(script, model_name=model_name)


@router.get("", response_model=list[VideoScriptOut])
async def list_video_scripts(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
) -> list[VideoScriptOut]:
    model_name = await _get_kling_model_name(db, user.id)
    result = await db.execute(
        select(VideoScript)
        .where(VideoScript.user_id == user.id)
        .order_by(VideoScript.created_at.desc())
        .limit(min(limit, 100))
    )
    return [_script_to_out(row, model_name=model_name) for row in result.scalars().all()]


@router.get("/{script_id}", response_model=VideoScriptOut)
async def get_video_script(
    script_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoScriptOut:
    script = await _get_owned_script(db, script_id, user.id)
    model_name = await _get_kling_model_name(db, user.id)
    return _script_to_out(script, model_name=model_name)


@router.post("/{script_id}/polish", response_model=VideoScriptOut)
async def polish_video_script(
    script_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoScriptOut:
    script = await _get_owned_script(db, script_id, user.id)
    if script.status != "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="脚本尚未拆解完成，无法润色")

    decomposed = script.decomposed_script if isinstance(script.decomposed_script, dict) else None
    if not decomposed or not decomposed.get("segments"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="脚本缺少分镜内容，无法润色")

    try:
        polished = await polish_decomposed_script(decomposed)
    except ScriptPolishError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except QwenError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    script.decomposed_script = polished
    if polished.get("title"):
        script.title = str(polished["title"]).strip() or script.title
    if polished.get("summary") is not None:
        script.summary = str(polished["summary"]).strip() or None
    if polished.get("transcript"):
        script.raw_transcript = str(polished["transcript"]).strip() or script.raw_transcript

    meta = dict(script.extra_metadata or {})
    meta.update(
        {
            "hook": polished.get("hook"),
            "body": polished.get("body"),
            "cta": polished.get("cta"),
            "tone": polished.get("tone"),
            "targetAudience": polished.get("targetAudience"),
            "tags": polished.get("tags") or [],
            "polishedAt": utc_now().isoformat(),
            "polishProvider": "qwen",
        }
    )
    script.extra_metadata = meta
    script.updated_at = utc_now()
    await db.commit()
    await db.refresh(script)

    model_name = await _get_kling_model_name(db, user.id)
    return _script_to_out(script, model_name=model_name)


@router.patch("/{script_id}", response_model=VideoScriptOut)
async def update_video_script(
    script_id: int,
    body: VideoScriptUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoScriptOut:
    script = await _get_owned_script(db, script_id, user.id)
    if body.title is not None:
        script.title = body.title.strip() or None
    if body.summary is not None:
        script.summary = body.summary
    if body.raw_transcript is not None:
        script.raw_transcript = body.raw_transcript
    if body.decomposed_script is not None:
        script.decomposed_script = body.decomposed_script
    if body.assembly_order is not None:
        meta = dict(script.extra_metadata or {})
        meta["assemblyOrder"] = body.assembly_order
        script.extra_metadata = meta
    if body.continuity_enabled is not None:
        script.continuity_enabled = body.continuity_enabled
    if body.bottom_barrage_enabled is not None:
        script.bottom_barrage_enabled = body.bottom_barrage_enabled
    if "persona_id" in body.model_fields_set:
        if body.persona_id is not None:
            persona_result = await db.execute(select(Persona).where(Persona.id == body.persona_id))
            persona = persona_result.scalar_one_or_none()
            if not persona or persona.user_id != user.id:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="人设不存在")
            script.persona_id = body.persona_id
        else:
            script.persona_id = None
    script.updated_at = utc_now()
    await db.commit()
    await db.refresh(script)
    model_name = await _get_kling_model_name(db, user.id)
    return _script_to_out(script, model_name=model_name)


@router.delete("/{script_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_video_script(
    script_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    script = await _get_owned_script(db, script_id, user.id)
    await db.delete(script)
    await db.commit()


def _script_video_params(
    body: ScriptGenerateVideoIn | ScriptSegmentGenerateIn,
    *,
    script_id: int,
    kling_task_type: str,
    duration: int,
    segment_index: int | None = None,
    continuity: bool = False,
    continuity_from_segment: int | None = None,
    scene_compose: bool | None = None,
    scene_compose_applied: bool | None = None,
    scene_frame_key: str | None = None,
    scene_compose_warning: str | None = None,
) -> dict:
    params = {
        "duration": duration,
        "resolution": body.resolution or "720p",
        "aspectRatio": body.aspect_ratio or "16:9",
        "sound": body.sound,
        "provider": "kling",
        "scriptId": script_id,
        "klingTaskType": kling_task_type,
        "continuity": continuity,
    }
    if segment_index is not None:
        params["segmentIndex"] = segment_index
    if continuity_from_segment is not None:
        params["continuityFromSegment"] = continuity_from_segment
    if scene_compose is not None:
        params["sceneCompose"] = scene_compose
    if scene_compose_applied is not None:
        params["sceneComposeApplied"] = scene_compose_applied
    if scene_frame_key:
        params["sceneFrameKey"] = scene_frame_key
    if scene_compose_warning:
        params["sceneComposeWarning"] = scene_compose_warning
    return params


async def _wait_for_task_completion(
    db: AsyncSession,
    task: VideoGenerationTask,
    *,
    max_seconds: int = 900,
) -> str:
    import time

    from app.routers.videos import _sync_task_if_needed

    deadline = time.time() + max_seconds
    while time.time() < deadline:
        await _sync_task_if_needed(db, task)
        await db.refresh(task)
        if task.status in {"completed", "failed"}:
            return task.status
        await asyncio.sleep(5)
    raise HTTPException(
        status_code=status.HTTP_504_GATEWAY_TIMEOUT,
        detail="等待分镜生成超时，请稍后在生成工作室查看进度",
    )


async def _refresh_segment_tasks(db: AsyncSession, script: VideoScript) -> None:
    from app.routers.videos import _sync_task_if_needed

    tasks_meta = get_segment_tasks(script)
    if not tasks_meta:
        return

    changed = False
    for key, info in list(tasks_meta.items()):
        task_id = info.get("taskId")
        if not task_id:
            continue
        result = await db.execute(select(VideoGenerationTask).where(VideoGenerationTask.id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            continue
        await _sync_task_if_needed(db, task)
        new_status = task.status
        new_url = task.generated_video_url
        new_expanded = task.expanded_prompt
        next_info = {**info, "status": new_status, "videoUrl": new_url}
        if new_expanded:
            next_info["expandedPrompt"] = new_expanded
        if (
            info.get("status") != new_status
            or info.get("videoUrl") != new_url
            or info.get("expandedPrompt") != next_info.get("expandedPrompt")
        ):
            tasks_meta[key] = next_info
            changed = True

    if changed:
        meta = dict(script.extra_metadata or {})
        meta["segmentTasks"] = tasks_meta
        script.extra_metadata = meta
        script.updated_at = utc_now()
        await db.commit()
        await db.refresh(script)


def _build_segments_out(script: VideoScript, *, model_name: str) -> ScriptSegmentsOut:
    segments = parse_script_segments(script, model_name=model_name)
    max_kling = max_kling_duration_seconds(model_name=model_name)
    order = resolve_segment_order(script, model_name=model_name)
    segment_by_index = {seg.index: seg for seg in segments}
    tasks = get_segment_tasks(script)
    assembled = get_assembled_video(script)
    segment_rows: list[ScriptSegmentOut] = []
    pending = 0
    processing = 0
    all_ready = bool(segments)

    ordered_segments = [segment_by_index[idx] for idx in order if idx in segment_by_index]
    aspect_overrides = get_segment_aspect_overrides(script)
    artboard_layers_map = get_segment_artboard_layers_map(script)

    for seg in ordered_segments:
        info = tasks.get(str(seg.index), {})
        status = info.get("status")
        if status in {"pending", "processing"}:
            processing += 1
        elif status != "completed" or not info.get("videoUrl"):
            pending += 1
            all_ready = False
        gen_params = info.get("generationParams") if isinstance(info.get("generationParams"), dict) else {}
        prepared = get_prepared_frame(script, seg.index)
        ff_config = get_segment_first_frame_config(script, seg.index)
        effective_aspect = (
            gen_params.get("aspectRatio")
            or aspect_overrides.get(seg.index)
            or "16:9"
        )
        segment_rows.append(
            ScriptSegmentOut(
                index=seg.index,
                start_sec=seg.start_sec,
                end_sec=seg.end_sec,
                spoken_text=seg.spoken_text or None,
                visual_description=seg.visual_description or None,
                purpose=seg.purpose or None,
                kling_duration_sec=seg.kling_duration_sec,
                natural_duration_sec=max(0.0, seg.end_sec - seg.start_sec),
                task_id=info.get("taskId"),
                task_status=status,
                video_url=info.get("videoUrl"),
                user_prompt=info.get("userPrompt") or build_segment_prompt(script, seg),
                expanded_prompt=info.get("expandedPrompt"),
                reference_image_urls=info.get("referenceImageUrls"),
                continuity_from_segment=info.get("continuityFromSegment"),
                continuity_frame_url=info.get("continuityFrameUrl"),
                generation_params={
                    "duration": gen_params.get("duration", seg.kling_duration_sec),
                    "resolution": gen_params.get("resolution", "720p"),
                    "aspectRatio": effective_aspect,
                    "sound": gen_params.get("sound", True),
                    "modelName": gen_params.get("modelName", model_name),
                    "continuity": gen_params.get("continuity", True),
                    "sceneCompose": gen_params.get("sceneCompose", True),
                    "sceneComposeApplied": gen_params.get("sceneComposeApplied"),
                    "sceneComposeWarning": gen_params.get("sceneComposeWarning"),
                    "sceneFrameUrl": gen_params.get("sceneFrameUrl"),
                    "preparedFrameUrl": prepared.get("publicUrl") if prepared else gen_params.get("preparedFrameUrl"),
                    "preparedFrameReview": prepared.get("review") if prepared else gen_params.get("preparedFrameReview"),
                    "firstFrameMode": ff_config.get("mode", "prepared"),
                    "personaImageIndex": ff_config.get("personaImageIndex", 0),
                    "personaImageIndexes": ff_config.get("personaImageIndexes", [0]),
                    "personaImageRotations": ff_config.get("personaImageRotations") or {},
                },
                artboard_layers=artboard_layers_map.get(seg.index) or None,
                suggested_artboard_layers=suggest_segment_artboard_layers(script, seg.index) or None,
            )
        )

    if not segments:
        all_ready = False

    return ScriptSegmentsOut(
        script_id=script.id,
        script_duration_sec=infer_script_duration_seconds(script),
        segments=segment_rows,
        assembly_order=order,
        continuity_enabled=bool(getattr(script, "continuity_enabled", True)),
        bottom_barrage_enabled=bool(getattr(script, "bottom_barrage_enabled", False)),
        assembled_video_url=assembled.get("videoUrl") if assembled else None,
        all_segments_ready=all_ready,
        max_kling_duration_sec=max_kling,
        min_kling_duration_sec=min_kling_duration_seconds(model_name=model_name),
        pending_count=pending,
        processing_count=processing,
    )


async def _generate_segment_task(
    db: AsyncSession,
    *,
    script: VideoScript,
    user: User,
    segment_index: int,
    body: ScriptSegmentGenerateIn,
    kling_config,
) -> VideoGenerationTask:
    if script.status != "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="脚本尚未拆解完成")

    model_name = kling_config.model_name or "kling-v3"
    segments = parse_script_segments(script, model_name=model_name)
    segment = next((item for item in segments if item.index == segment_index), None)
    if not segment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分镜不存在")

    duration_sec = resolve_segment_duration_sec(
        script,
        segment,
        override=body.duration,
        model_name=model_name,
    )
    if body.duration is not None:
        meta = dict(script.extra_metadata or {})
        overrides = dict(meta.get("segmentDurationOverrides") or {})
        overrides[str(segment_index)] = duration_sec
        meta["segmentDurationOverrides"] = overrides
        script.extra_metadata = meta

    aspect_ratio = resolve_segment_aspect_ratio(
        script,
        segment_index,
        override=body.aspect_ratio,
    ) or body.aspect_ratio or "16:9"
    if aspect_ratio not in {"16:9", "9:16"}:
        aspect_ratio = "16:9"

    tasks = get_segment_tasks(script)
    existing = tasks.get(str(segment_index))
    if existing and existing.get("status") in {"pending", "processing"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"分镜 #{segment_index} 正在生成中")

    persona_result = await db.execute(select(Persona).where(Persona.id == body.persona_id))
    persona = persona_result.scalar_one_or_none()
    if not persona or persona.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="人设不存在")

    images_result = await db.execute(
        select(ReferenceImage).where(ReferenceImage.persona_id == body.persona_id)
    )
    reference_images = list(images_result.scalars().all())
    media = build_persona_media_bundle(persona, reference_images)
    primary_image = media["primary_image"]

    user_prompt = (body.user_prompt or "").strip() or build_segment_prompt(
        script,
        segment,
        persona_name=persona.name,
        persona_description=persona.description,
    )
    user_prompt = append_artboard_generation_constraints(user_prompt, script, segment_index)
    artboard_locked = segment_artboard_enabled(script, segment_index)
    reference_urls = media["reference_image_urls"]
    reference_keys = media["reference_image_keys"]
    ff_config = get_segment_first_frame_config(script, segment_index)
    ff_mode = str(ff_config.get("mode") or "prepared")
    ff_persona_index = int(ff_config.get("personaImageIndex") or 0)
    selected_persona_images = resolve_persona_reference_images(reference_images, ff_config)
    continuity_from_segment: int | None = None
    continuity_frame_url: str | None = None
    scene_frame_key: str | None = None
    scene_compose_warning: str | None = None
    prepared_first_frame_mode = False
    frame_review: dict | None = None

    continuity_from_segment = (
        previous_segment_in_order(script, segment_index, model_name=model_name)
        if body.continuity
        else None
    )
    continuity_active = body.continuity and continuity_from_segment is not None
    use_first_screen_pipeline = ff_mode == "prepared" and not continuity_active
    effective_scene_compose = use_first_screen_pipeline and (body.scene_compose or True)

    if body.continuity and continuity_from_segment is not None:
        await _refresh_segment_tasks(db, script)
        prev_info = get_segment_tasks(script).get(str(continuity_from_segment), {})
        prev_url = prev_info.get("videoUrl")
        if prev_info.get("status") != "completed" or not prev_url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"分镜 #{continuity_from_segment} 尚未完成，无法使用连贯性作为首帧",
            )
        try:
            frame = await upload_continuity_frame(
                prev_url,
                script_id=script.id,
                from_segment_index=continuity_from_segment,
                for_segment_index=segment_index,
            )
        except VideoFrameError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
        continuity_frame_url = frame["public_url"]
        reference_urls = [continuity_frame_url]
        reference_keys = [frame["key"]]
        user_prompt = (
            f"{user_prompt}\n\n"
            f"【连贯性】参考图即分镜 #{continuity_from_segment} 的最后一帧画面，"
            "本分镜必须从此画面无缝延续，禁止开场硬切、换场景或重新构图；"
            "保持相同人物、场景、光影与镜头角度，仅做小幅自然动作延续。"
        )
        if artboard_locked:
            user_prompt += (
                "\n【画板+连贯性】主画面从参考首帧无缝延续；"
                "贴图/标签由画板配置，生成视频时不绘制叠层。"
            )

    if effective_scene_compose and reference_images and segment.visual_description:
        prepared = get_prepared_frame(script, segment_index)
        use_cached = (
            prepared
            and prepared.get("personaId") == body.persona_id
            and prepared.get("publicUrl")
            and prepared.get("key")
            and not body.force_prepare_frame
        )
        try:
            if use_cached:
                reference_urls = [str(prepared["publicUrl"])]
                reference_keys = [str(prepared["key"])]
                scene_frame_key = str(prepared["key"])
                frame_review = prepared.get("review") if isinstance(prepared.get("review"), dict) else None
            else:
                portrait = resolve_portrait_for_first_screen(reference_images, ff_config)
                portrait_url, portrait_key = resolve_face_source_for_first_screen(portrait)
                frame_result = await prepare_and_validate_segment_frame(
                    script_id=script.id,
                    segment_index=segment_index,
                    persona_image_url=portrait_url,
                    persona_image_key=portrait_key,
                    visual_description=segment.visual_description,
                    persona_name=persona.name,
                    persona_description=_persona_description_with_body(
                        persona, media, portrait=portrait
                    ),
                    aspect_ratio=aspect_ratio,
                )
                frame_review = frame_result["review"]
                scene_frame_key = frame_result["key"]
                reference_urls = [frame_result["public_url"]]
                reference_keys = [frame_result["key"]]
                script.extra_metadata = merge_prepared_frame(
                    script,
                    segment_index,
                    key=frame_result["key"],
                    public_url=frame_result["public_url"],
                    persona_id=body.persona_id,
                    review=frame_review,
                    action=str(frame_result.get("action") or ""),
                    scene=str(frame_result.get("scene") or ""),
                )

            prepared_first_frame_mode = True
            review_note = ""
            if frame_review:
                review_note = (
                    f" 模型质检 score={frame_review.get('score', 0)}，"
                    f"{frame_review.get('summary', '')}。"
                )
                if not frame_review.get("passed"):
                    scene_compose_warning = (
                        f"首帧质检未完全通过：{frame_review.get('summary') or '建议重新准备首帧'}"
                    )
            user_prompt = (
                f"{user_prompt}\n\n"
                "【首屏锁定】参考图为以人脸为身份参考、人物与场景一体生成的口播首屏；"
                "视频必须从此首屏无缝延续，人物正面直立、完整上半身，背景以脚本场景为准。"
                f"{review_note}"
            )
        except PersonaSceneError as exc:
            scene_compose_warning = str(exc)
            logger.warning(
                "First frame prepare failed for script %s segment %s: %s",
                script.id,
                segment_index,
                exc,
            )

    if use_first_screen_pipeline and not prepared_first_frame_mode:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=scene_compose_warning or "首屏合成失败，请先在人设中提取人脸，并在画板生成首屏",
        )

    protagonist_reference_hint: str | None = None
    if prepared_first_frame_mode:
        protagonist_reference_hint = (
            f"【主角形象】出镜者即主角 {persona.name}，须与首屏参考图完全一致（正面直立、完整上半身）。"
            f" {media.get('body_profile_hint') or ''}".strip()
        )
    elif (
        not continuity_active
        and ff_mode == "persona"
        and selected_persona_images
    ):
        reference_urls, reference_keys = await resolve_rotated_kling_references(
            selected_persona_images,
            reference_images,
            ff_config.get("personaImageRotations"),
            persona_id=persona.id,
        )
        protagonist_reference_hint = describe_protagonist_reference_images(
            selected_persona_images,
            persona.name,
            body_profile_hint=media.get("body_profile_hint"),
        )

    runtime = KlingRuntimeConfig.from_kling_config(kling_config)
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
            reference_image_urls=reference_urls,
            reference_image_keys=reference_keys,
            user_prompt=user_prompt,
            duration=duration_sec,
            resolution=body.resolution,
            aspect_ratio=aspect_ratio,
            enable_sound=body.sound,
            continuity_mode=continuity_active,
            artboard_locked=artboard_locked,
            prepared_first_frame_mode=prepared_first_frame_mode,
            expression_tone=media["expression_tone"],
            expression_notes=media["expression_notes"],
            reference_expression_hint=media["reference_expression_hint"],
            protagonist_reference_hint=protagonist_reference_hint or media.get("protagonist_reference_hint"),
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
        prompt=user_prompt[:2000],
        expanded_prompt=result["expanded_prompt"],
        reference_image_keys=reference_keys,
        video_params=_script_video_params(
            body,
            script_id=script.id,
            kling_task_type=result["task_type"],
            duration=duration_sec,
            segment_index=segment_index,
            continuity=continuity_active,
            continuity_from_segment=continuity_from_segment,
            scene_compose=effective_scene_compose,
            scene_compose_applied=scene_frame_key is not None,
            scene_frame_key=scene_frame_key,
            scene_compose_warning=scene_compose_warning,
        ),
        gemini_operation_name=result["operation_name"],
        status="processing",
        started_at=utc_now(),
    )
    db.add(task)
    await db.flush()

    meta = dict(script.extra_metadata or {})
    segment_tasks = dict(meta.get("segmentTasks") or {})
    segment_tasks[str(segment_index)] = {
        "taskId": task.id,
        "status": "processing",
        "videoUrl": None,
        "klingDurationSec": duration_sec,
        "userPrompt": user_prompt,
        "referenceImageUrls": reference_urls,
        "continuity": body.continuity,
        "continuityFromSegment": continuity_from_segment,
        "continuityFrameUrl": continuity_frame_url,
        "generationParams": {
            "duration": duration_sec,
            "resolution": body.resolution or "720p",
            "aspectRatio": aspect_ratio,
            "sound": body.sound,
            "modelName": model_name,
            "continuity": body.continuity,
            "sceneCompose": effective_scene_compose,
            "sceneComposeApplied": scene_frame_key is not None,
            "sceneComposeWarning": scene_compose_warning,
            "sceneFrameUrl": reference_urls[0] if scene_frame_key else None,
            "preparedFrameUrl": reference_urls[0] if scene_frame_key else None,
            "preparedFrameReview": frame_review,
            "firstFrameMode": ff_mode,
            "personaImageIndex": ff_persona_index,
            "personaImageIndexes": ff_config.get("personaImageIndexes", [ff_persona_index]),
            "personaImageRotations": ff_config.get("personaImageRotations") or {},
        },
    }
    meta["segmentTasks"] = segment_tasks
    script.extra_metadata = meta
    if script.persona_id != body.persona_id:
        script.persona_id = body.persona_id
    script.updated_at = utc_now()
    await db.commit()
    await db.refresh(task)
    return task


@router.get("/{script_id}/segments", response_model=ScriptSegmentsOut)
async def list_script_segments(
    script_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScriptSegmentsOut:
    script = await _get_owned_script(db, script_id, user.id)
    await _refresh_segment_tasks(db, script)
    model_name = await _get_kling_model_name(db, user.id)
    return _build_segments_out(script, model_name=model_name)


def _raw_segment_indexes(script: VideoScript) -> set[int]:
    decomposed = script.decomposed_script if isinstance(script.decomposed_script, dict) else {}
    raw_segments = decomposed.get("segments")
    if not isinstance(raw_segments, list):
        return set()
    indexes: set[int] = set()
    for idx, raw in enumerate(raw_segments, start=1):
        if not isinstance(raw, dict):
            continue
        indexes.add(int(raw.get("index", idx)))
    return indexes


@router.patch("/{script_id}/segments/{segment_index}", response_model=ScriptSegmentsOut)
async def update_script_segment(
    script_id: int,
    segment_index: int,
    body: ScriptSegmentUpdateIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScriptSegmentsOut:
    script = await _get_owned_script(db, script_id, user.id)
    if segment_index not in _raw_segment_indexes(script):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分镜不存在")

    model_name = await _get_kling_model_name(db, user.id)
    meta = dict(script.extra_metadata or {})

    if body.duration is not None:
        duration_sec = clamp_kling_duration(body.duration, model_name=model_name)
        overrides = dict(meta.get("segmentDurationOverrides") or {})
        overrides[str(segment_index)] = duration_sec
        meta["segmentDurationOverrides"] = overrides

    if body.aspect_ratio is not None:
        if body.aspect_ratio not in {"16:9", "9:16"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="画幅仅支持 16:9 或 9:16")
        aspect_overrides = dict(meta.get("segmentAspectOverrides") or {})
        aspect_overrides[str(segment_index)] = body.aspect_ratio
        meta["segmentAspectOverrides"] = aspect_overrides

    if body.artboard_layers is not None:
        layers = normalize_artboard_layers(body.artboard_layers)
        board_layers = dict(meta.get("segmentArtboardLayers") or {})
        if layers:
            board_layers[str(segment_index)] = layers
        else:
            board_layers.pop(str(segment_index), None)
        meta["segmentArtboardLayers"] = board_layers

    if (
        body.first_frame_mode is not None
        or body.persona_image_index is not None
        or body.persona_image_indexes is not None
        or body.persona_image_rotations is not None
    ):
        if body.first_frame_mode is not None and body.first_frame_mode not in {"persona", "prepared"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="首帧模式仅支持 persona 或 prepared",
            )
        ff_configs = dict(meta.get("segmentFirstFrame") or {})
        current = dict(
            ff_configs.get(str(segment_index))
            or get_segment_first_frame_config(script, segment_index)
        )
        if body.first_frame_mode is not None:
            current["mode"] = body.first_frame_mode
        if body.persona_image_indexes is not None:
            cleaned: list[int] = []
            seen: set[int] = set()
            for item in body.persona_image_indexes:
                try:
                    idx = int(item)
                except (TypeError, ValueError):
                    continue
                if idx < 0 or idx in seen:
                    continue
                seen.add(idx)
                cleaned.append(idx)
            current["personaImageIndexes"] = cleaned[:4] if cleaned else [0]
            current["personaImageIndex"] = current["personaImageIndexes"][0]
        elif body.persona_image_index is not None:
            idx = max(0, body.persona_image_index)
            current["personaImageIndex"] = idx
            current["personaImageIndexes"] = [idx]
        if body.persona_image_rotations is not None:
            cleaned_rotations: dict[str, int] = {}
            for key, value in body.persona_image_rotations.items():
                try:
                    idx = int(key)
                    deg = int(value) % 360
                    if deg < 0:
                        deg += 360
                    if deg in {0, 90, 180, 270}:
                        cleaned_rotations[str(idx)] = deg
                except (TypeError, ValueError):
                    continue
            current["personaImageRotations"] = cleaned_rotations
        ff_configs[str(segment_index)] = current
        meta["segmentFirstFrame"] = ff_configs

    if body.excluded is True:
        excluded = sorted(get_excluded_segment_indexes(script) | {segment_index})
        meta["excludedSegments"] = excluded
        order = resolve_segment_order(script, model_name=model_name)
        meta["assemblyOrder"] = [idx for idx in order if idx != segment_index]
        segment_tasks = dict(meta.get("segmentTasks") or {})
        segment_tasks.pop(str(segment_index), None)
        meta["segmentTasks"] = segment_tasks

    script.extra_metadata = meta
    script.updated_at = utc_now()
    await db.commit()
    await db.refresh(script)
    return _build_segments_out(script, model_name=model_name)


@router.post(
    "/{script_id}/segments/{segment_index}/artboard-assets/presign",
    response_model=PersonaImagePresignOut,
)
async def presign_segment_artboard_asset(
    script_id: int,
    segment_index: int,
    body: PersonaImagePresignIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    script = await _get_owned_script(db, script_id, user.id)
    if segment_index not in _raw_segment_indexes(script):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分镜不存在")

    try:
        credentials = await create_script_artboard_upload_credentials(
            script_id,
            segment_index,
            body.filename,
            content_type=body.content_type,
        )
    except CosNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return credentials


@router.post(
    "/{script_id}/segments/{segment_index}/artboard-from-script",
    response_model=ScriptSegmentsOut,
)
async def import_segment_artboard_from_script(
    script_id: int,
    segment_index: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScriptSegmentsOut:
    script = await _get_owned_script(db, script_id, user.id)
    if segment_index not in _raw_segment_indexes(script):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分镜不存在")

    model_name = await _get_kling_model_name(db, user.id)
    suggested = normalize_artboard_layers(suggest_segment_artboard_layers(script, segment_index))
    if not suggested:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="未能从脚本拆解中识别贴图/角标布局，请检查 visualDescription 或 overlays 字段",
        )

    meta = dict(script.extra_metadata or {})
    board_layers = dict(meta.get("segmentArtboardLayers") or {})
    board_layers[str(segment_index)] = suggested
    meta["segmentArtboardLayers"] = board_layers
    script.extra_metadata = meta
    script.updated_at = utc_now()
    await db.commit()
    await db.refresh(script)
    return _build_segments_out(script, model_name=model_name)


@router.delete("/{script_id}/segments/{segment_index}", response_model=ScriptSegmentsOut)
async def delete_script_segment(
    script_id: int,
    segment_index: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScriptSegmentsOut:
    return await update_script_segment(
        script_id,
        segment_index,
        ScriptSegmentUpdateIn(excluded=True),
        user=user,
        db=db,
    )


@router.post(
    "/{script_id}/segments/{segment_index}/prepare-frame",
    response_model=ScriptSegmentPrepareFrameOut,
)
async def prepare_script_segment_frame(
    script_id: int,
    segment_index: int,
    body: ScriptSegmentPrepareFrameIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScriptSegmentPrepareFrameOut:
    """Stage 1: image processing + VL review; store prepared first frame for video generation."""
    script = await _get_owned_script(db, script_id, user.id)
    if script.status != "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="脚本尚未拆解完成")

    model_name = (await get_kling_config(db, user.id)).model_name or "kling-v3"
    segments = parse_script_segments(script, model_name=model_name)
    segment = next((item for item in segments if item.index == segment_index), None)
    if not segment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分镜不存在")
    if not segment.visual_description:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="分镜缺少画面描述")

    _, scene_desc = split_visual_action_and_scene(segment.visual_description)

    prepared = get_prepared_frame(script, segment_index)
    if (
        prepared
        and prepared.get("personaId") == body.persona_id
        and prepared.get("publicUrl")
        and not body.force
        and not body.apply_review_feedback
    ):
        review = prepared.get("review") if isinstance(prepared.get("review"), dict) else {}
        regen = prepared.get("regenPlan") if isinstance(prepared.get("regenPlan"), dict) else {}
        return ScriptSegmentPrepareFrameOut(
            frame_url=str(prepared["publicUrl"]),
            frame_key=str(prepared.get("key") or ""),
            review_passed=bool(review.get("passed")),
            review_score=int(review.get("score") or 0),
            review_issues=[str(i) for i in review.get("issues") or [] if i],
            review_summary=str(review.get("summary") or ""),
            review_fix_suggestions=[str(s) for s in review.get("fixSuggestions") or [] if s],
            regen_background=str(regen.get("backgroundAdditions") or ""),
            regen_compose=str(regen.get("composeGuidance") or ""),
            action=str(prepared.get("action") or ""),
            scene=str(prepared.get("scene") or scene_desc),
        )

    persona_result = await db.execute(
        select(Persona).where(Persona.id == body.persona_id, Persona.user_id == user.id)
    )
    persona = persona_result.scalar_one_or_none()
    if not persona:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="人设不存在")

    images_result = await db.execute(
        select(ReferenceImage).where(ReferenceImage.persona_id == body.persona_id)
    )
    reference_images = list(images_result.scalars().all())
    if not reference_images:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="人设缺少参考图")
    media = build_persona_media_bundle(persona, reference_images)
    ff_config = get_segment_first_frame_config(script, segment_index)
    try:
        portrait = resolve_portrait_for_first_screen(reference_images, ff_config)
        portrait_url, portrait_key = resolve_face_source_for_first_screen(portrait)
    except PersonaSceneError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    aspect_ratio = resolve_segment_aspect_ratio(
        script,
        segment_index,
        override=body.aspect_ratio,
    ) or body.aspect_ratio or "16:9"
    if aspect_ratio not in {"16:9", "9:16"}:
        aspect_ratio = "16:9"

    feedback_issues = list(body.review_issues or [])
    feedback_summary = (body.review_summary or "").strip()
    feedback_fix: list[str] = [str(s) for s in (body.fix_suggestions or []) if s]
    if body.apply_review_feedback and prepared:
        prev_review = prepared.get("review") if isinstance(prepared.get("review"), dict) else {}
        if not feedback_issues:
            feedback_issues = [str(i) for i in prev_review.get("issues") or [] if i]
        feedback_summary = feedback_summary or str(prev_review.get("summary") or "")
        if not feedback_fix:
            feedback_fix = [str(s) for s in prev_review.get("fixSuggestions") or [] if s]

    try:
        frame_result = await prepare_and_validate_segment_frame(
            script_id=script.id,
            segment_index=segment_index,
            persona_image_url=portrait_url,
            persona_image_key=portrait_key,
            visual_description=segment.visual_description,
            persona_name=persona.name,
            persona_description=_persona_description_with_body(
                persona, media, portrait=portrait
            ),
            aspect_ratio=aspect_ratio,
            review_issues=feedback_issues if body.apply_review_feedback else None,
            review_summary=feedback_summary if body.apply_review_feedback else "",
            fix_suggestions=feedback_fix if body.apply_review_feedback else None,
        )
    except PersonaSceneError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    review = frame_result["review"]
    regen_plan = frame_result.get("regenPlan") if isinstance(frame_result.get("regenPlan"), dict) else {}
    meta = dict(script.extra_metadata or {})
    frames = dict(meta.get("preparedFrames") or {})
    frames[str(segment_index)] = {
        **(frames.get(str(segment_index)) or {}),
        "key": frame_result["key"],
        "publicUrl": frame_result["public_url"],
        "personaId": body.persona_id,
        "review": review,
        "action": str(frame_result.get("action") or ""),
        "scene": str(frame_result.get("scene") or ""),
        "regenPlan": regen_plan,
        "preparedAt": time.time(),
    }
    meta["preparedFrames"] = frames
    script.extra_metadata = meta
    script.updated_at = utc_now()
    await db.commit()

    return ScriptSegmentPrepareFrameOut(
        frame_url=frame_result["public_url"],
        frame_key=frame_result["key"],
        review_passed=bool(review.get("passed")),
        review_score=int(review.get("score") or 0),
        review_issues=[str(i) for i in review.get("issues") or [] if i],
        review_summary=str(review.get("summary") or ""),
        review_fix_suggestions=[str(s) for s in review.get("fixSuggestions") or [] if s],
        regen_background=str(regen_plan.get("backgroundAdditions") or ""),
        regen_compose=str(regen_plan.get("composeGuidance") or ""),
        action=str(frame_result.get("action") or ""),
        scene=str(frame_result.get("scene") or ""),
    )


@router.post("/{script_id}/segments/{segment_index}/generate", response_model=VideoTaskOut)
async def generate_script_segment(
    script_id: int,
    segment_index: int,
    body: ScriptSegmentGenerateIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoGenerationTask:
    script = await _get_owned_script(db, script_id, user.id)
    kling_config = await get_kling_config(db, user.id)
    return await _generate_segment_task(
        db,
        script=script,
        user=user,
        segment_index=segment_index,
        body=body,
        kling_config=kling_config,
    )


@router.post("/{script_id}/segments/generate-all", response_model=ScriptGenerateAllOut)
async def generate_all_script_segments(
    script_id: int,
    body: ScriptSegmentGenerateIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScriptGenerateAllOut:
    script = await _get_owned_script(db, script_id, user.id)
    if script.status != "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="脚本尚未拆解完成")

    kling_config = await get_kling_config(db, user.id)
    model_name = kling_config.model_name or "kling-v3"
    segments = parse_script_segments(script, model_name=model_name)
    if not segments:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="脚本没有分镜数据")

    await _refresh_segment_tasks(db, script)
    tasks = get_segment_tasks(script)
    created: list[int] = []
    skipped = 0
    order = resolve_segment_order(script, model_name=model_name)
    segment_by_index = {seg.index: seg for seg in segments}

    for seg_index in order:
        if seg_index not in segment_by_index:
            continue
        info = tasks.get(str(seg_index), {})
        status_value = info.get("status")
        if status_value in {"pending", "processing"}:
            skipped += 1
            continue
        if status_value == "completed" and info.get("videoUrl"):
            skipped += 1
            continue
        task = await _generate_segment_task(
            db,
            script=script,
            user=user,
            segment_index=seg_index,
            body=body,
            kling_config=kling_config,
        )
        created.append(task.id)
        if body.continuity:
            final_status = await _wait_for_task_completion(db, task)
            if final_status != "completed":
                break
        await db.refresh(script)
        tasks = get_segment_tasks(script)

    return ScriptGenerateAllOut(created_count=len(created), skipped_count=skipped, task_ids=created)


@router.post("/{script_id}/assemble", response_model=ScriptAssembleOut)
async def assemble_script_video(
    script_id: int,
    body: ScriptAssembleIn | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScriptAssembleOut:
    script = await _get_owned_script(db, script_id, user.id)
    await _refresh_segment_tasks(db, script)

    model_name = await _get_kling_model_name(db, user.id)
    segments = parse_script_segments(script, model_name=model_name)
    if not segments:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="脚本没有分镜数据")

    segment_order = resolve_segment_order(
        script,
        model_name=model_name,
        override=body.segment_order if body and body.segment_order else None,
    )
    if not segment_order:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="没有可整合的分镜")

    tasks = get_segment_tasks(script)
    spoken_by_index = {seg.index: (seg.spoken_text or "").strip() for seg in segments}
    video_urls: list[str] = []
    barrage_captions: list[str] = []
    for idx in segment_order:
        info = tasks.get(str(idx), {})
        if info.get("status") != "completed" or not info.get("videoUrl"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"分镜 #{idx} 尚未生成完成，无法整合",
            )
        video_urls.append(info["videoUrl"])
        barrage_captions.append(spoken_by_index.get(idx, ""))

    script_id_val = script.id
    bottom_barrage_enabled = bool(getattr(script, "bottom_barrage_enabled", False))

    # 下载 + ffmpeg 可能耗时较长，先释放 DB 连接避免 Supabase 池回收导致 commit 失败
    await db.close()

    try:
        result = await assemble_videos_from_urls(
            video_urls,
            script_id=script_id_val,
            bottom_barrage_captions=barrage_captions if bottom_barrage_enabled else None,
        )
    except VideoAssemblyError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    factory = session_factory()
    async with factory() as write_db:
        script = await _get_owned_script(write_db, script_id_val, user.id)
        meta = dict(script.extra_metadata or {})
        meta["assembled"] = {
            "videoUrl": result["public_url"],
            "key": result["key"],
            "bottomBarrageEnabled": bottom_barrage_enabled,
        }
        script.extra_metadata = meta
        script.updated_at = utc_now()
        await write_db.commit()

    return ScriptAssembleOut(
        script_id=script_id_val,
        video_url=result["public_url"],
        key=result["key"],
        segment_count=len(video_urls),
    )


@router.get("/{script_id}/generate-estimate", response_model=ScriptGenerateVideoEstimateOut)
async def estimate_script_video_generation(
    script_id: int,
    duration: int = 5,
    resolution: str = "720p",
    sound: bool = True,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScriptGenerateVideoEstimateOut:
    await _get_owned_script(db, script_id, user.id)
    low, high = estimate_generation_minutes(duration=duration, resolution=resolution, sound=sound)
    return ScriptGenerateVideoEstimateOut(
        duration=duration,
        resolution=resolution,
        sound=sound,
        min_minutes=low,
        max_minutes=high,
        message=f"预计 {low}–{high} 分钟完成，提交后可在「生成工作室」查看进度",
    )


@router.post("/{script_id}/generate-video", response_model=VideoTaskOut)
async def generate_video_from_script(
    script_id: int,
    body: ScriptGenerateVideoIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoGenerationTask:
    script = await _get_owned_script(db, script_id, user.id)
    if script.status != "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="脚本尚未拆解完成，请稍后再试")

    persona_result = await db.execute(select(Persona).where(Persona.id == body.persona_id))
    persona = persona_result.scalar_one_or_none()
    if not persona or persona.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="人设不存在")

    images_result = await db.execute(
        select(ReferenceImage).where(ReferenceImage.persona_id == body.persona_id)
    )
    reference_images = list(images_result.scalars().all())
    media = build_persona_media_bundle(persona, reference_images)

    kling_config = await get_kling_config(db, user.id)
    target_duration = body.duration or recommend_kling_duration(
        script, model_name=kling_config.model_name or "kling-v3"
    )
    user_prompt = build_user_prompt_from_script(script, target_duration_sec=target_duration)
    runtime = KlingRuntimeConfig.from_kling_config(kling_config)
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
            user_prompt=user_prompt,
            duration=target_duration,
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

    if script.persona_id != body.persona_id:
        script.persona_id = body.persona_id
        script.updated_at = utc_now()

    task = VideoGenerationTask(
        user_id=user.id,
        persona_id=body.persona_id,
        mode="persona_agent",
        prompt=user_prompt[:2000],
        expanded_prompt=result["expanded_prompt"],
        reference_image_keys=media["reference_image_keys"],
        video_params=_script_video_params(
            body,
            script_id=script.id,
            kling_task_type=result["task_type"],
            duration=target_duration,
        ),
        gemini_operation_name=result["operation_name"],
        status="processing",
        started_at=utc_now(),
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task
