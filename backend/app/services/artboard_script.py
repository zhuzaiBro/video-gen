"""Extract overlay / sticker layout from decomposed script for artboard."""

from __future__ import annotations

import re
import uuid
from typing import Any

from app.services.visual_props import extract_screen_props, suggest_prop_image_layers

POSITION_PRESETS: dict[str, tuple[float, float]] = {
    "top-left": (18.0, 15.0),
    "top-right": (82.0, 15.0),
    "top-center": (50.0, 12.0),
    "bottom-left": (18.0, 85.0),
    "bottom-right": (82.0, 85.0),
    "bottom-center": (50.0, 88.0),
    "center": (50.0, 50.0),
    "lower-third": (50.0, 78.0),
    "upper-third": (50.0, 22.0),
}

SLICE_COLORS: dict[str, str] = {
    "热卖": "#ff4757",
    "限时": "#ffa502",
    "秒杀": "#e84393",
    "关注": "#3742fa",
    "新品": "#00b894",
    "包邮": "#0984e3",
    "推荐": "#6c5ce7",
    "爆款": "#ff4757",
}

POSITION_ALIASES: dict[str, str] = {
    "左上": "top-left",
    "左上方": "top-left",
    "右上角": "top-right",
    "右上": "top-right",
    "右上方": "top-right",
    "顶部": "top-center",
    "上方": "top-center",
    "顶部居中": "top-center",
    "左下": "bottom-left",
    "左下角": "bottom-left",
    "右下": "bottom-right",
    "右下角": "bottom-right",
    "底部": "bottom-center",
    "下方": "bottom-center",
    "底部居中": "bottom-center",
    "居中": "center",
    "中间": "center",
    "画面中央": "center",
    "下三分之一": "lower-third",
    "下方三分之一": "lower-third",
    "上三分之一": "upper-third",
}

DEFAULT_W: dict[str, float] = {
    "slice": 22.0,
    "text": 30.0,
    "sticker": 18.0,
    "image": 28.0,
}

OVERLAY_KEYWORDS = ("贴图", "贴纸", "标签", "角标", "花字", "字幕", "浮层", "badge", "overlay", "贴纸说明")


def _normalize_position(raw: object) -> str:
    if not isinstance(raw, str):
        return "top-right"
    key = raw.strip().lower().replace("_", "-").replace(" ", "-")
    if key in POSITION_PRESETS:
        return key
    for alias, preset in POSITION_ALIASES.items():
        if alias in raw:
            return preset
    return "top-right"


def _coords(position: str) -> tuple[float, float]:
    return POSITION_PRESETS.get(position, POSITION_PRESETS["top-right"])


def _layer_id() -> str:
    return uuid.uuid4().hex[:12]


def _normalize_overlay_type(raw: object) -> str:
    if not isinstance(raw, str):
        return "slice"
    value = raw.strip().lower()
    if value in {"slice", "sticker", "text", "image"}:
        return value
    if value in {"badge", "label", "tag", "caption"}:
        return "slice"
    if value in {"emoji", "icon"}:
        return "sticker"
    return "slice"


def _overlay_dict_to_layer(raw: dict[str, Any], *, z_index: int) -> dict[str, Any] | None:
    content = str(raw.get("content") or raw.get("text") or raw.get("label") or "").strip()
    if not content:
        return None
    layer_type = _normalize_overlay_type(raw.get("type"))
    position = _normalize_position(raw.get("position") or raw.get("placement") or "top-right")
    x, y = _coords(position)
    if raw.get("x") is not None and raw.get("y") is not None:
        try:
            x = float(raw["x"])
            y = float(raw["y"])
        except (TypeError, ValueError):
            pass
    w = DEFAULT_W.get(layer_type, 22.0)
    if raw.get("w") is not None:
        try:
            w = float(raw["w"])
        except (TypeError, ValueError):
            pass
    layer: dict[str, Any] = {
        "id": _layer_id(),
        "type": layer_type,
        "content": content[:500],
        "x": max(4.0, min(96.0, x)),
        "y": max(4.0, min(96.0, y)),
        "w": max(4.0, min(80.0, w)),
        "zIndex": z_index,
        "source": "script",
    }
    color = raw.get("color")
    if isinstance(color, str) and color.strip():
        layer["color"] = color.strip()[:32]
    elif layer_type == "slice" and content in SLICE_COLORS:
        layer["color"] = SLICE_COLORS[content]
    return layer


def overlays_from_structured(raw_segment: dict[str, Any]) -> list[dict]:
    raw_overlays = raw_segment.get("overlays") or raw_segment.get("overlayElements")
    if not isinstance(raw_overlays, list):
        return []
    layers: list[dict] = []
    for idx, item in enumerate(raw_overlays[:12]):
        if not isinstance(item, dict):
            continue
        layer = _overlay_dict_to_layer(item, z_index=idx + 1)
        if layer:
            layers.append(layer)
    return layers


def _parse_position_from_text(text: str) -> str:
    for alias, preset in POSITION_ALIASES.items():
        if alias in text:
            return preset
    if re.search(r"右.?上|upper.?right", text, re.I):
        return "top-right"
    if re.search(r"左.?上|upper.?left", text, re.I):
        return "top-left"
    if re.search(r"右.?下|lower.?right", text, re.I):
        return "bottom-right"
    if re.search(r"左.?下|lower.?left", text, re.I):
        return "bottom-left"
    if "底部" in text or "下方" in text:
        return "bottom-center"
    if "顶部" in text or "上方" in text:
        return "top-center"
    return "top-right"


def _extract_quoted_labels(text: str) -> list[str]:
    labels: list[str] = []
    for match in re.finditer(r"[「『\"']([^「『\"']{1,20})[」』\"']", text):
        label = match.group(1).strip()
        if label and label not in labels:
            labels.append(label)
    for word in SLICE_COLORS:
        if word in text and word not in labels:
            labels.append(word)
    return labels[:6]


def overlays_from_visual_description(visual_description: str) -> list[dict]:
    text = visual_description.strip()
    if not text:
        return []
    if not any(kw in text for kw in OVERLAY_KEYWORDS):
        # Still try if quoted labels + position hints exist
        labels = _extract_quoted_labels(text)
        if not labels:
            return []

    position = _parse_position_from_text(text)
    x, y = _coords(position)
    labels = _extract_quoted_labels(text)
    layers: list[dict] = []

    if labels:
        for idx, label in enumerate(labels):
            is_emoji = len(label) <= 2 and ord(label[0]) > 0x1F000 if label else False
            layer_type = "sticker" if is_emoji else "slice"
            offset_x = x + (idx * 8 - (len(labels) - 1) * 4)
            layer: dict[str, Any] = {
                "id": _layer_id(),
                "type": layer_type,
                "content": label,
                "x": max(8.0, min(92.0, offset_x)),
                "y": y,
                "w": DEFAULT_W[layer_type],
                "zIndex": idx + 1,
                "source": "script",
            }
            if layer_type == "slice" and label in SLICE_COLORS:
                layer["color"] = SLICE_COLORS[label]
            layers.append(layer)
        return layers

    # Generic overlay mention without explicit label — add placeholder text from snippet
    snippet = text[:40].rstrip("，。； ")
    layers.append(
        {
            "id": _layer_id(),
            "type": "text",
            "content": snippet,
            "x": x,
            "y": y,
            "w": 36.0,
            "zIndex": 1,
            "source": "script",
        }
    )
    return layers


def suggest_artboard_layers_from_segment(raw_segment: dict[str, Any]) -> list[dict]:
    structured = overlays_from_structured(raw_segment)
    visual = str(raw_segment.get("visualDescription") or raw_segment.get("visual_description") or "").strip()
    prop_layers = suggest_prop_image_layers(visual, extract_screen_props(visual))
    if structured:
        return structured + [layer for layer in prop_layers if layer not in structured]
    overlay_layers = overlays_from_visual_description(visual)
    if overlay_layers:
        return overlay_layers + prop_layers
    return prop_layers


def get_raw_decomposed_segment(script, segment_index: int) -> dict[str, Any] | None:
    decomposed = script.decomposed_script if isinstance(script.decomposed_script, dict) else {}
    raw_segments = decomposed.get("segments")
    if not isinstance(raw_segments, list):
        return None
    for raw in raw_segments:
        if not isinstance(raw, dict):
            continue
        try:
            if int(raw.get("index", -1)) == segment_index:
                return raw
        except (TypeError, ValueError):
            continue
    return None


def describe_artboard_layout_for_generation(layers: list[dict]) -> str | None:
    if not layers:
        return None
    hints: list[str] = []
    for layer in layers:
        pos = f"约 {layer['x']:.0f}%/{layer['y']:.0f}%"
        layer_type = layer.get("type", "")
        content = layer.get("content", "")
        if layer_type == "sticker":
            hints.append(f"{pos} 预留贴纸位（{content}）")
        elif layer_type == "slice":
            hints.append(f"{pos} 预留标签位「{content}」")
        elif layer_type == "text":
            hints.append(f"{pos} 预留文案位「{content}」")
        else:
            hints.append(f"{pos} 预留贴图区域")
    return (
        "【脚本贴图布局】以下区域由画板后期叠加（生成主画面时请保留空间、勿在该区域放置关键主体）："
        + "；".join(hints)
    )


def strip_overlay_clauses_from_visual(visual_description: str) -> str:
    """Return main-scene description with overlay clauses removed for cleaner generation."""
    text = visual_description.strip()
    if not text:
        return text
    # Split on common overlay lead-ins and keep the main part
    parts = re.split(
        r"[，。；]\s*(?=(?:画面|镜头|主体|人物|场景|背景|展示|呈现|拍摄))",
        text,
    )
    main_parts = [p for p in parts if p.strip() and not any(kw == p.strip()[:4] for kw in ("贴图", "标签", "角标", "花字"))]
    if main_parts:
        cleaned = "，".join(main_parts)
    else:
        cleaned = re.sub(
            r"(?:左上角|右上角|左下角|右下角|底部|顶部)[有是显示]?[^，。；]*?(?:贴图|标签|角标|花字|字幕|浮层)[^，。；]*[，。；]?",
            "",
            text,
        ).strip()
    return cleaned or text
