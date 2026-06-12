from sqlalchemy import select

from app.database import session_factory
from app.models import VideoScript
from app.services.qwen import QwenError, VideoDownloadError, analyze_video_script, detect_platform
from app.utils import utc_now


async def run_script_analysis(script_id: int) -> None:
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
            platform = detect_platform(script.source_url)
            analysis, analysis_meta = await analyze_video_script(script.source_url)

            script.platform = platform
            script.title = analysis.get("title") or script.title
            script.summary = analysis.get("summary")
            script.raw_transcript = analysis.get("transcript")
            script.decomposed_script = analysis
            script.extra_metadata = {
                **analysis_meta,
                "provider": "qwen",
                "hook": analysis.get("hook"),
                "body": analysis.get("body"),
                "cta": analysis.get("cta"),
                "tone": analysis.get("tone"),
                "targetAudience": analysis.get("targetAudience"),
                "tags": analysis.get("tags") or [],
            }
            script.status = "completed"
            script.error_message = None
        except (QwenError, VideoDownloadError, ValueError) as exc:
            script.status = "failed"
            script.error_message = str(exc)
        except Exception as exc:
            script.status = "failed"
            script.error_message = f"脚本拆解失败: {exc}"

        script.updated_at = utc_now()
        await db.commit()
