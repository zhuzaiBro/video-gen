"""Separate non-generatable screen/UI props from video-generation visual prompts."""

from __future__ import annotations

import re
import uuid

# 《游戏名》UI / 截图 / 界面
_BRACKET_UI_RE = re.compile(
    r"《([^》]{1,40})》[^，。；\n]*?(?:UI|ui|界面|截图|画面|海报|icon|图标)?"
)
_PHONE_SHOW_RE = re.compile(
    r"(?:手机|屏幕)[^，。；\n]{0,24}?(?:展示|显示|呈现|露出)[^，。；\n]{0,12}?"
    r"(?:《[^》]+》|[^，。；\n]{2,30}?(?:截图|界面|UI|ui))"
)
_SHOW_SCREEN_RE = re.compile(
    r"(?:展示|显示|呈现|举起)[^，。；\n]{0,20}?(?:一张|一幅)?[^，。；\n]{0,30}?(?:截图|界面|UI|ui)"
)


def _layer_id() -> str:
    return uuid.uuid4().hex[:12]


def extract_screen_props(visual_description: str) -> list[str]:
    """Extract specific screen/UI content that models cannot invent."""
    text = visual_description.strip()
    if not text:
        return []

    props: list[str] = []
    seen: set[str] = set()

    def add_prop(label: str) -> None:
        clean = re.sub(r"\s+", " ", label).strip(" ，。；、")
        if not clean or clean in seen or len(clean) < 2:
            return
        seen.add(clean)
        props.append(clean[:80])

    for match in _BRACKET_UI_RE.finditer(text):
        name = match.group(1).strip()
        snippet = match.group(0)
        if "UI" in snippet.upper() or "界面" in snippet or "截图" in snippet:
            add_prop(f"{name} UI/界面截图")
        else:
            add_prop(f"{name} 相关截图")

    for match in _PHONE_SHOW_RE.finditer(text):
        add_prop(match.group(0))

    for match in _SHOW_SCREEN_RE.finditer(text):
        add_prop(match.group(0))

    if "手机" in text and ("截图" in text or "界面" in text or "UI" in text.upper()):
        if not props:
            add_prop("手机屏幕展示内容（需上传真实截图）")

    return props[:6]


def sanitize_visual_for_generation(visual_description: str) -> tuple[str, list[str]]:
    """
    Return visual text safe for video model + list of props needing uploaded assets.
    Replaces specific game/app UI with generic phone-screen placeholder language.
    """
    text = visual_description.strip()
    props = extract_screen_props(text)
    if not props:
        return text, []

    cleaned = text
    cleaned = _BRACKET_UI_RE.sub("手机屏幕区域", cleaned)
    cleaned = re.sub(
        r"(?:展示|显示|呈现)[^，。；]*?(?:一张|一幅)?[^，。；]*?(?:截图|界面|UI|ui)",
        "手机屏幕朝向镜头",
        cleaned,
    )
    cleaned = re.sub(r"《[^》]+》", "", cleaned)
    cleaned = re.sub(r"展示一张手机屏幕区域", "持手机朝向镜头", cleaned)
    cleaned = re.sub(r"手机手机屏幕", "手机，屏幕", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"[，,]{2,}", "，", cleaned)
    cleaned = cleaned.strip("，。； ")

    if "手机" not in cleaned and ("手机" in text or "屏幕" in text):
        cleaned = f"{cleaned}，左手持手机朝向镜头" if cleaned else "出镜者手持手机朝向镜头"

    if "画板" not in cleaned and "贴图" not in cleaned:
        cleaned = (
            f"{cleaned}（手机屏幕具体画面由画板贴图提供，生成时勿凭空绘制游戏/应用界面）"
            if cleaned
            else "出镜者手持手机，屏幕内容由画板贴图提供"
        )

    return cleaned, props


def describe_screen_props_for_generation(props: list[str]) -> str | None:
    if not props:
        return None
    joined = "；".join(props)
    return (
        "【屏幕/贴图素材】以下具体内容 AI 无法凭空生成，需用户上传真实截图后在画板叠加："
        f"{joined}。"
        "可灵生成时仅呈现手持手机/展示道具的动作与构图，手机画面区域保持中性留白，"
        "不要绘制可识别的游戏、应用或商标界面。"
    )


def suggest_prop_image_layers(visual_description: str, props: list[str]) -> list[dict]:
    """Suggest artboard reminder layers (text) for props pending user upload."""
    if not props:
        return []

    text = visual_description.strip()
    has_phone = "手机" in text or "屏幕" in text
    x, y = (42.0, 58.0) if has_phone else (50.0, 50.0)

    layers: list[dict] = []
    for idx, prop in enumerate(props[:4]):
        layers.append(
            {
                "id": _layer_id(),
                "type": "text",
                "content": f"↑请上传：{prop}",
                "x": min(88.0, x + idx * 4),
                "y": min(88.0, y + idx * 6),
                "w": 34.0,
                "zIndex": idx + 1,
                "source": "screen_prop",
                "color": "#ffa502",
            }
        )
    return layers
