from sqlalchemy import select

from app.database import session_factory
from app.models import VideoScript
from app.services.tech_topics import TechTopicError, generate_decomposed_script_from_topic
from app.utils import utc_now


async def run_script_from_topic(
    script_id: int,
    *,
    topic: dict,
    target_duration_sec: int = 90,
    extra_query: str | None = None,
) -> None:
    factory = session_factory()
    async with factory() as db:
        result = await db.execute(select(VideoScript).where(VideoScript.id == script_id))
        script = result.scalar_one_or_none()
        if script is None:
            return

        script.status = "processing"
        script.error_message = None
        script.updated_at = utc_now()
        await db.commit()

        try:
            analysis = await generate_decomposed_script_from_topic(
                topic,
                target_duration_sec=target_duration_sec,
                extra_query=extra_query,
            )
            script.platform = "tech-topic"
            script.title = analysis.get("title") or topic.get("title") or script.title
            script.summary = analysis.get("summary")
            script.raw_transcript = analysis.get("transcript")
            script.decomposed_script = analysis
            script.extra_metadata = {
                **(script.extra_metadata or {}),
                "provider": "qwen",
                "sourceType": "tech-topic",
                "topic": topic,
                "hook": analysis.get("hook"),
                "body": analysis.get("body"),
                "cta": analysis.get("cta"),
                "tone": analysis.get("tone"),
                "targetAudience": analysis.get("targetAudience"),
                "tags": analysis.get("tags") or [],
            }
            script.status = "completed"
            script.error_message = None
        except TechTopicError as exc:
            script.status = "failed"
            script.error_message = str(exc)
        except Exception as exc:
            script.status = "failed"
            script.error_message = f"话题脚本生成失败: {exc}"

        script.updated_at = utc_now()
        await db.commit()
