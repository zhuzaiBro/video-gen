"""Polish decomposed video scripts via Qwen text model."""

from __future__ import annotations

import json
from typing import Any

import httpx

from app.config import settings
from app.services.qwen import DASHSCOPE_DEFAULT_BASE, QwenError, _extract_json, _require_api_key

POLISH_PROMPT = """你是一位短视频口播脚本润色专家。请对下方 JSON 脚本做表达优化，要求：

1. **思想与结构不变**：核心观点、论证逻辑、Hook/Body/CTA 结构、分镜数量与顺序不得改变。
2. **时间轴不变**：每个分镜的 index、startSec、endSec、purpose 必须与原文一致，不得增删分镜或改时间。
3. **可润色字段**：title、summary、transcript、hook、body、cta、tone、targetAudience、tags、各分镜的 spokenText、visualDescription、overlays 的 content/notes（贴图类型与 position 保持不变）。
4. **口播润色**：spokenText 更口语化、节奏更适合短视频；可适当调整用词，但不改变原意与关键信息点。
5. **画面描述**：visualDescription 只写可拍摄的场景/动作/镜头；不写原视频讲解者性别外貌，用「出镜者」；实际出镜人物由用户人设决定。
   **禁止**在 visualDescription 中要求生成具体游戏名、App 界面、商标 UI（如《空洞骑士》截图）——应改为「举手机朝向镜头、点屏幕」等动作，具体截图放入 overlays（type=image，注明需用户上传）。
6. **overlays**：保留 type、position、color；可优化 content/notes 文案；屏幕截图类用 type=image。

请严格输出完整 JSON（不要 markdown 代码块），结构与输入相同，字段名保持 camelCase。"""


class ScriptPolishError(Exception):
    pass


async def _call_qwen_text_json(*, user_content: str) -> dict[str, Any]:
    api_key = _require_api_key()
    model = settings.qwen_text_model or "qwen-plus"
    base_url = (settings.dashscope_base_url or DASHSCOPE_DEFAULT_BASE).rstrip("/")
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": POLISH_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.4,
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
        )
    if response.status_code >= 400:
        detail = response.text.strip() or response.reason_phrase
        raise QwenError(f"通义千问 API 错误 ({response.status_code}): {detail}")

    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise QwenError("通义千问未返回润色结果")
    text = (choices[0].get("message") or {}).get("content", "")
    if not text.strip():
        raise QwenError("通义千问返回空内容")
    return _extract_json(text)


def _segment_index(seg: dict[str, Any], fallback: int) -> int:
    try:
        return int(seg.get("index", fallback))
    except (TypeError, ValueError):
        return fallback


def _merge_segment(original: dict[str, Any], polished: dict[str, Any], *, fallback_index: int) -> dict[str, Any]:
    idx = _segment_index(original, fallback_index)
    merged: dict[str, Any] = {
        "index": idx,
        "startSec": original.get("startSec", original.get("start_sec", 0)),
        "endSec": original.get("endSec", original.get("end_sec", 0)),
        "purpose": original.get("purpose") or polished.get("purpose") or "body",
        "spokenText": (
            polished.get("spokenText")
            or polished.get("spoken_text")
            or original.get("spokenText")
            or original.get("spoken_text")
            or ""
        ),
        "visualDescription": (
            polished.get("visualDescription")
            or polished.get("visual_description")
            or original.get("visualDescription")
            or original.get("visual_description")
            or ""
        ),
    }
    orig_overlays = original.get("overlays")
    pol_overlays = polished.get("overlays")
    if isinstance(pol_overlays, list):
        if isinstance(orig_overlays, list) and len(orig_overlays) == len(pol_overlays):
            overlays: list[dict[str, Any]] = []
            for orig_o, pol_o in zip(orig_overlays, pol_overlays):
                if not isinstance(orig_o, dict):
                    orig_o = {}
                if not isinstance(pol_o, dict):
                    pol_o = {}
                overlays.append(
                    {
                        "type": orig_o.get("type") or pol_o.get("type") or "slice",
                        "content": pol_o.get("content") or orig_o.get("content") or "",
                        "position": orig_o.get("position") or pol_o.get("position") or "top-right",
                        **({"color": orig_o["color"]} if orig_o.get("color") else {}),
                        **({"notes": pol_o.get("notes") or orig_o.get("notes")} if (pol_o.get("notes") or orig_o.get("notes")) else {}),
                    }
                )
            merged["overlays"] = overlays
        else:
            merged["overlays"] = pol_overlays
    elif isinstance(orig_overlays, list):
        merged["overlays"] = orig_overlays
    return merged


def merge_polished_script(original: dict[str, Any], polished: dict[str, Any]) -> dict[str, Any]:
    orig_segments = original.get("segments")
    pol_segments = polished.get("segments")
    if not isinstance(orig_segments, list) or not orig_segments:
        raise ScriptPolishError("脚本缺少分镜，无法润色")
    if not isinstance(pol_segments, list):
        raise ScriptPolishError("润色结果缺少分镜数据")
    if len(pol_segments) != len(orig_segments):
        raise ScriptPolishError(
            f"润色后分镜数量变化（{len(orig_segments)} → {len(pol_segments)}），已保留原结构并仅合并文案"
        )

    merged_segments = [
        _merge_segment(
            orig if isinstance(orig, dict) else {},
            pol if isinstance(pol, dict) else {},
            fallback_index=i + 1,
        )
        for i, (orig, pol) in enumerate(zip(orig_segments, pol_segments))
    ]

    merged: dict[str, Any] = {**original}
    for key in ("title", "summary", "transcript", "hook", "body", "cta", "tone", "targetAudience", "tags"):
        if key in polished and polished[key] is not None:
            merged[key] = polished[key]
    merged["segments"] = merged_segments
    return merged


async def polish_decomposed_script(decomposed: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(decomposed, dict) or not decomposed.get("segments"):
        raise ScriptPolishError("脚本尚未拆解或缺少分镜")
    payload = json.dumps(decomposed, ensure_ascii=False, indent=2)
    polished = await _call_qwen_text_json(user_content=f"请润色以下脚本 JSON：\n\n{payload}")
    if not isinstance(polished, dict):
        raise ScriptPolishError("润色结果格式无效")
    return merge_polished_script(decomposed, polished)
