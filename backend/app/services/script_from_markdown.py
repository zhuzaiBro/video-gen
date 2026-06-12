"""Convert Markdown script drafts into decomposed video scripts."""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select

from app.database import session_factory
from app.models import VideoScript
from app.services.tech_topics import _call_qwen_json
from app.utils import utc_now

MAX_MARKDOWN_CHARS = 80_000
MIN_MARKDOWN_CHARS = 20

SCRIPT_FROM_MARKDOWN_SYSTEM = """你是短视频脚本拆解专家。用户会提供 Markdown 格式的口播稿、分镜大纲或讲解提纲，请拆解为适合数字人口播视频的分镜脚本。
要求：保留原文核心信息与口播语气；分镜画面用「出镜者」描述，不写性别外貌；技术讲解需有具体画面动作。"""

SCRIPT_FROM_MARKDOWN_USER = """请将以下 Markdown 内容拆解为短视频口播分镜脚本。

{title_block}目标总时长约 {target_sec} 秒。

Markdown 原文：
---
{markdown}
---

严格输出 JSON（不要 markdown 代码块），字段与视频拆解一致：
{{
  "title": "视频标题",
  "summary": "50字内摘要",
  "transcript": "完整口播串联",
  "hook": "前3秒钩子",
  "body": "主体要点（换行分段）",
  "cta": "结尾引导",
  "tone": "语气风格",
  "targetAudience": "目标受众",
  "tags": ["标签"],
  "segments": [
    {{
      "index": 1,
      "startSec": 0,
      "endSec": 3.5,
      "spokenText": "该段口播",
      "visualDescription": "出镜者动作与场景背景描述",
      "overlays": [],
      "purpose": "hook|body|cta|transition"
    }}
  ]
}}

规则：
- 若 MD 已有章节/分镜/列表结构，按语义拆分；否则按口播节奏拆 4–12 段
- startSec/endSec 可含小数，各段时长之和接近目标总时长
- visualDescription 只写主画面动作与场景，用「出镜者」
- 涉及具体游戏/App/商标 UI 时写入 overlays（type=image，注明需用户上传截图），勿写进 visualDescription 让模型凭空生成
- 无贴图则 overlays 为空数组"""


class ScriptMarkdownError(Exception):
    pass


def _slug_from_title(title: str) -> str:
    slug = re.sub(r"[^\w\-]+", "-", title.strip().lower()).strip("-")
    return (slug[:48] or "import")


def _title_from_markdown(markdown: str) -> str:
    for line in markdown.splitlines():
        text = line.strip()
        if text.startswith("#"):
            return text.lstrip("#").strip()[:120]
    first = next((ln.strip() for ln in markdown.splitlines() if ln.strip()), "")
    return first[:80] if first else "Markdown 脚本"


async def generate_decomposed_script_from_markdown(
    markdown: str,
    *,
    title_hint: str | None = None,
    target_duration_sec: int = 90,
    extra_notes: str | None = None,
) -> dict[str, Any]:
    content = markdown.strip()
    if len(content) < MIN_MARKDOWN_CHARS:
        raise ScriptMarkdownError(f"Markdown 内容过短（至少 {MIN_MARKDOWN_CHARS} 字）")
    if len(content) > MAX_MARKDOWN_CHARS:
        raise ScriptMarkdownError(f"Markdown 内容超过 {MAX_MARKDOWN_CHARS} 字限制")

    hint = (title_hint or "").strip() or _title_from_markdown(content)
    title_block = f"标题提示：{hint}\n" if hint else ""
    user = SCRIPT_FROM_MARKDOWN_USER.format(
        title_block=title_block,
        target_sec=max(30, min(300, target_duration_sec)),
        markdown=content,
    )
    if extra_notes and extra_notes.strip():
        user += f"\n\n额外要求：{extra_notes.strip()}"

    script = await _call_qwen_json(
        system=SCRIPT_FROM_MARKDOWN_SYSTEM,
        user=user,
        enable_search=False,
        temperature=0.35,
    )
    if not isinstance(script.get("segments"), list) or not script["segments"]:
        raise ScriptMarkdownError("拆解结果缺少分镜 segments")
    script["title"] = script.get("title") or hint
    return script


async def run_script_from_markdown(
    script_id: int,
    *,
    markdown: str,
    title_hint: str | None = None,
    target_duration_sec: int = 90,
    extra_notes: str | None = None,
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
            analysis = await generate_decomposed_script_from_markdown(
                markdown,
                title_hint=title_hint,
                target_duration_sec=target_duration_sec,
                extra_notes=extra_notes,
            )
            title = str(analysis.get("title") or title_hint or script.title or "Markdown 脚本")
            script.platform = "markdown"
            script.title = title
            script.summary = analysis.get("summary")
            script.raw_transcript = analysis.get("transcript")
            script.decomposed_script = analysis
            script.extra_metadata = {
                **(script.extra_metadata or {}),
                "provider": "qwen",
                "sourceType": "markdown",
                "markdownCharCount": len(markdown.strip()),
                "hook": analysis.get("hook"),
                "body": analysis.get("body"),
                "cta": analysis.get("cta"),
                "tone": analysis.get("tone"),
                "targetAudience": analysis.get("targetAudience"),
                "tags": analysis.get("tags") or [],
            }
            script.status = "completed"
            script.error_message = None
        except ScriptMarkdownError as exc:
            script.status = "failed"
            script.error_message = str(exc)
        except Exception as exc:
            script.status = "failed"
            script.error_message = f"Markdown 拆解失败: {exc}"

        script.updated_at = utc_now()
        await db.commit()
