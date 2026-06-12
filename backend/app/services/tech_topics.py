"""Search hot programmer-industry topics and generate technical video scripts."""

from __future__ import annotations

from typing import Any

import httpx

from app.config import settings
from app.services.qwen import DASHSCOPE_DEFAULT_BASE, QwenError, _extract_json, _require_api_key

TOPIC_SEARCH_SYSTEM = """你是程序员行业技术趋势分析助手。请结合联网检索结果，输出当前热门、适合做成短视频深度讲解的技术话题。
优先：AI/大模型、开源框架、云原生、编程语言、架构、开发者工具、热门争议与范式变化。
只输出 JSON，不要 markdown。"""

TOPIC_SEARCH_USER = """请搜索并整理 {count} 个程序员行业热门技术话题。
{focus}
每个话题需有技术深度潜力，适合 60–120 秒口播讲解。

严格输出 JSON：
{{
  "topics": [
    {{
      "id": "简短英文slug",
      "title": "话题标题",
      "summary": "为什么现在火、核心矛盾或看点（80字内）",
      "heat": "高|中",
      "keywords": ["关键词1", "关键词2"],
      "angles": ["讲解角度1", "讲解角度2"],
      "sources": [{{"title": "资料标题", "url": "https://...", "snippet": "要点一句"}}]
    }}
  ]
}}"""

SCRIPT_FROM_TOPIC_SYSTEM = """你是资深技术博主兼短视频脚本导演。根据给定热门话题与检索资料，撰写有技术深度的口播拆解脚本。
要求：原理讲清楚、有具体技术点、口播自然、结构适合短视频；分镜画面用「出镜者」描述，不写性别外貌。"""

SCRIPT_FROM_TOPIC_USER = """话题：{title}
摘要：{summary}
关键词：{keywords}
讲解角度（优先覆盖）：{angles}
资料要点：
{source_notes}

目标时长约 {target_sec} 秒，输出与视频拆解相同的 JSON 结构：
{{
  "title": "视频标题",
  "summary": "50字内摘要",
  "transcript": "完整口播串联",
  "hook": "前3秒钩子",
  "body": "主体要点（换行分段）",
  "cta": "结尾引导",
  "tone": "专业亲和",
  "targetAudience": "程序员/技术从业者",
  "tags": ["标签"],
  "segments": [
    {{
      "index": 1,
      "startSec": 0,
      "endSec": 3.5,
      "spokenText": "口播",
      "visualDescription": "出镜者坐在桌前讲解，背景为室内书架与台灯，双手自然比划",
      "overlays": [],
      "purpose": "hook|body|cta|transition"
    }}
  ]
}}

分镜 4–8 段，startSec/endSec 可含小数。
visualDescription 只写出镜者动作与场景（如举手机、点屏幕），**不要**写具体游戏/App/商标界面名称让模型凭空画出来。
若口播涉及某产品截图，在 overlays 用 type=image、content 写「【需上传】xxx截图」、notes 说明素材；无贴图则 overlays 为空数组。"""


class TechTopicError(Exception):
    pass


async def _call_qwen_json(
    *,
    system: str,
    user: str,
    enable_search: bool = False,
    temperature: float = 0.35,
) -> dict[str, Any]:
    api_key = _require_api_key()
    model = settings.qwen_text_model or "qwen-plus"
    base_url = (settings.dashscope_base_url or DASHSCOPE_DEFAULT_BASE).rstrip("/")
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
    }
    if enable_search:
        payload["enable_search"] = True

    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
        )
    if response.status_code >= 400:
        detail = response.text.strip() or response.reason_phrase
        raise TechTopicError(f"通义千问 API 错误 ({response.status_code}): {detail}")

    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise TechTopicError("通义千问未返回内容")
    text = (choices[0].get("message") or {}).get("content", "")
    if not text.strip():
        raise TechTopicError("通义千问返回空内容")
    try:
        return _extract_json(text)
    except QwenError as exc:
        raise TechTopicError(f"结果解析失败: {exc}") from exc


def _normalize_topics(raw: dict[str, Any]) -> list[dict[str, Any]]:
    topics = raw.get("topics")
    if not isinstance(topics, list):
        return []
    out: list[dict[str, Any]] = []
    for i, item in enumerate(topics[:12]):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        slug = str(item.get("id") or f"topic-{i + 1}").strip()
        sources_raw = item.get("sources") if isinstance(item.get("sources"), list) else []
        sources: list[dict[str, str]] = []
        for s in sources_raw[:5]:
            if not isinstance(s, dict):
                continue
            url = str(s.get("url") or "").strip()
            sources.append(
                {
                    "title": str(s.get("title") or "参考").strip(),
                    "url": url if url.startswith("http") else "",
                    "snippet": str(s.get("snippet") or "").strip(),
                }
            )
        out.append(
            {
                "id": slug,
                "title": title,
                "summary": str(item.get("summary") or "").strip(),
                "heat": str(item.get("heat") or "中").strip(),
                "keywords": [str(k) for k in (item.get("keywords") or []) if k][:8],
                "angles": [str(a) for a in (item.get("angles") or []) if a][:5],
                "sources": sources,
            }
        )
    return out


async def search_hot_tech_topics(
    *,
    query: str | None = None,
    limit: int = 8,
) -> list[dict[str, Any]]:
    focus = f"用户聚焦方向：{query.strip()}。请优先返回与此相关的热门话题。" if query and query.strip() else "不限方向，覆盖当前综合热度最高的技术话题。"
    count = max(4, min(12, limit))
    try:
        _require_api_key()
    except QwenError as exc:
        raise TechTopicError(str(exc)) from exc

    raw = await _call_qwen_json(
        system=TOPIC_SEARCH_SYSTEM,
        user=TOPIC_SEARCH_USER.format(count=count, focus=focus),
        enable_search=True,
        temperature=0.25,
    )
    topics = _normalize_topics(raw)
    if not topics:
        raise TechTopicError("未检索到热门话题，请换关键词重试")
    return topics


def _format_source_notes(topic: dict[str, Any]) -> str:
    lines: list[str] = []
    for s in topic.get("sources") or []:
        if not isinstance(s, dict):
            continue
        title = s.get("title") or "参考"
        snippet = s.get("snippet") or ""
        url = s.get("url") or ""
        line = f"- {title}"
        if snippet:
            line += f"：{snippet}"
        if url:
            line += f" ({url})"
        lines.append(line)
    if topic.get("summary"):
        lines.insert(0, f"- 话题摘要：{topic['summary']}")
    return "\n".join(lines) if lines else "- 无额外资料，请基于话题常识深度展开"


async def generate_decomposed_script_from_topic(
    topic: dict[str, Any],
    *,
    target_duration_sec: int = 90,
    extra_query: str | None = None,
) -> dict[str, Any]:
    title = str(topic.get("title") or "").strip()
    if not title:
        raise TechTopicError("话题标题为空")

    user = SCRIPT_FROM_TOPIC_USER.format(
        title=title,
        summary=str(topic.get("summary") or ""),
        keywords="、".join(topic.get("keywords") or []) or "无",
        angles="；".join(topic.get("angles") or []) or "原理与实战",
        source_notes=_format_source_notes(topic),
        target_sec=max(45, min(180, target_duration_sec)),
    )
    if extra_query and extra_query.strip():
        user += f"\n\n额外要求：{extra_query.strip()}"

    script = await _call_qwen_json(
        system=SCRIPT_FROM_TOPIC_SYSTEM,
        user=user,
        enable_search=True,
        temperature=0.45,
    )
    if not isinstance(script.get("segments"), list) or not script["segments"]:
        raise TechTopicError("生成的脚本缺少分镜")
    script["title"] = script.get("title") or title
    return script
