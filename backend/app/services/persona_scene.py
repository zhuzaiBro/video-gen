"""Persona cutout + script scene background composition for segment generation."""

from __future__ import annotations

import asyncio
import io
import re
import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import settings
from app.services.cos import public_url, upload_image_bytes
from app.services.kling_image import resolve_kling_image
from app.services.qwen import (
    QwenError,
    _extract_json,
    _require_api_key,
    dashscope_compatible_base,
    dashscope_native_base,
    generate_integrated_first_frame,
    plan_first_frame_edit,
)

WANX_IMAGE_SYNTHESIS = "/api/v1/services/aigc/text2image/image-synthesis"
WANX_PORTRAIT_MODEL = "wanx-v1"

DEFAULT_STUDIO_SCENE = "简洁柔和的口播演播室或虚化室内背景，专业布光，无文字无道具"

FRAME_REVIEW_PROMPT = """你是短视频首帧质检员。请仔细查看这张口播首帧图，判断它是否适合作为口播视频的第一帧。

脚本要求：
- 人设：{persona_name}{persona_hint}
- 场景背景：{scene_description}
- 人物动作：{action_description}

检查要点：
1. 背景是否为脚本描述的场景（不应是人设原照片的室内/户外背景）
2. 人物是否有完整上半身与双臂，正面直立或符合脚本坐姿（禁止侧躺、横向旋转、仅漂浮头部）
3. 人物与场景是否在同一画面中自然融合（禁止抠图粘贴感、白边描边、头部悬空）
4. 是否执行了脚本要求的动作（持物、手势等）
5. 五官发型须与参考人脸一致，身体比例合理

请严格输出 JSON（不要 markdown 代码块）：
{{"passed": true或false, "score": 0到100的整数, "issues": ["问题1"], "summary": "一句话结论", "fixSuggestions": ["正面改进指令1"]}}

fixSuggestions 要求：针对 issues 给出具体、可执行的正面制作指令（应呈现什么画面、人物如何摆放、背景如何设置），帮助下一轮重新生成；禁止只写「不要/避免/不行」类否定句。"""

REGEN_PLAN_PROMPT = """你是短视频首帧导演。请把质检结论转化为下一轮「一体生成首帧」的正面制作指令（告诉图像编辑模型应生成什么画面，禁止写「不要/避免/不行」）。

脚本场景：{scene}
人物动作：{action}
人设：{persona_name}
质检问题：
{issues}
质检摘要：{summary}
已有改进建议：
{fix_suggestions}

请输出 JSON（不要 markdown）：
{{
  "backgroundAdditions": "场景与环境应呈现的元素、光影、桌面/书架/道具布局",
  "composeGuidance": "人物在场景中的一体化要求：完整上半身、坐姿/站姿、与桌面关系、双手动作与持物",
  "personHeightRatio": 0.72,
  "bottomMarginRatio": 0.05,
  "edgeFeatherPx": 2
}}
composeGuidance 须强调人物与背景一体生成、自然融合，而非后期粘贴。"""


class PersonaSceneError(Exception):
    pass


@dataclass(frozen=True)
class ComposeHints:
    person_height_ratio: float = 0.72
    bottom_margin_ratio: float = 0.05
    edge_feather_px: int = 2


@dataclass(frozen=True)
class RegenerationPlan:
    background_additions: str = ""
    compose_guidance: str = ""
    person_height_ratio: float = 0.72
    bottom_margin_ratio: float = 0.05
    edge_feather_px: int = 2
    fix_suggestions: tuple[str, ...] = ()

    @property
    def compose_hints(self) -> ComposeHints:
        return ComposeHints(
            person_height_ratio=self.person_height_ratio,
            bottom_margin_ratio=self.bottom_margin_ratio,
            edge_feather_px=self.edge_feather_px,
        )


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _plan_from_keyword_fallback(
    *,
    action: str,
    review_issues: list[str] | None,
    review_summary: str,
    fix_suggestions: list[str] | None,
) -> RegenerationPlan:
    """Rule-based fallback when text model unavailable."""
    text = f"{action} {' '.join(review_issues or [])} {review_summary} {' '.join(fix_suggestions or [])}"
    hints = ComposeHints()
    background_parts: list[str] = []
    compose_parts: list[str] = list(fix_suggestions or [])

    if any(k in text for k in ["双手", "比划", "手势", "动作"]):
        hints = ComposeHints(person_height_ratio=0.82, bottom_margin_ratio=0.03, edge_feather_px=2)
        compose_parts.append("人物上半身完整入镜，双手清晰可见，便于做比划动作")
        background_parts.append("前景留出适中高度的书桌，人物坐于桌后")
    if any(k in text for k in ["白边", "融合", "光影", "过渡", "粘贴", "漂浮", "头部", "悬空", "描边"]):
        hints = ComposeHints(
            person_height_ratio=hints.person_height_ratio,
            bottom_margin_ratio=hints.bottom_margin_ratio,
            edge_feather_px=5,
        )
        compose_parts.append("人物与场景在同一画面中一体生成，光影透视统一，无抠图白边与漂浮感")
        background_parts.append("统一柔和的室内自然光，主光源方向明确")
    if any(k in text for k in ["身体", "残缺", "上半身", "肩膀", "手臂"]):
        compose_parts.append("完整上半身与双臂入镜，身体与头部自然连接")
    if any(k in text for k in ["桌面", "衔接", "比例", "失真", "坐"]):
        hints = ComposeHints(
            person_height_ratio=min(hints.person_height_ratio, 0.76),
            bottom_margin_ratio=0.11,
            edge_feather_px=hints.edge_feather_px,
        )
        compose_parts.append("人物坐于书桌后方，肩线与桌面高度衔接自然")
        background_parts.append("中景书桌与书架同框，桌面高度适合口播坐姿")

    return RegenerationPlan(
        background_additions="，".join(dict.fromkeys(background_parts)),
        compose_guidance="；".join(dict.fromkeys(compose_parts)),
        person_height_ratio=hints.person_height_ratio,
        bottom_margin_ratio=hints.bottom_margin_ratio,
        edge_feather_px=hints.edge_feather_px,
        fix_suggestions=tuple(fix_suggestions or []),
    )


async def _call_qwen_text(*, system: str, user: str, temperature: float = 0.3) -> str:
    api_key = _require_api_key()
    model = settings.qwen_text_model or "qwen-plus"
    base_url = dashscope_compatible_base()
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
    }
    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
        )
    if response.status_code >= 400:
        raise PersonaSceneError(f"生成改进方案失败 ({response.status_code}): {response.text.strip()}")
    choices = response.json().get("choices") or []
    if not choices:
        raise PersonaSceneError("生成改进方案未返回结果")
    text = (choices[0].get("message") or {}).get("content", "")
    if not text.strip():
        raise PersonaSceneError("生成改进方案返回空内容")
    return text.strip()


async def build_regeneration_plan(
    *,
    scene: str,
    action: str,
    persona_name: str,
    review_issues: list[str] | None = None,
    review_summary: str = "",
    fix_suggestions: list[str] | None = None,
) -> RegenerationPlan:
    issues = [str(i).strip() for i in (review_issues or []) if str(i).strip()]
    suggestions = [str(s).strip() for s in (fix_suggestions or []) if str(s).strip()]
    if not issues and not review_summary.strip() and not suggestions:
        return RegenerationPlan()

    fallback = _plan_from_keyword_fallback(
        action=action,
        review_issues=issues,
        review_summary=review_summary,
        fix_suggestions=suggestions,
    )
    try:
        _require_api_key()
    except QwenError:
        return fallback

    user_content = REGEN_PLAN_PROMPT.format(
        scene=scene or "室内口播场景",
        action=action or "出镜口播",
        persona_name=persona_name,
        issues="\n".join(f"- {item}" for item in issues) if issues else "（无）",
        summary=review_summary or "（无）",
        fix_suggestions="\n".join(f"- {item}" for item in suggestions) if suggestions else "（无）",
    )
    try:
        raw = await _call_qwen_text(
            system="你是短视频首帧制作指导，只输出正面可执行指令，禁止否定式表述。",
            user=user_content,
        )
        parsed = _extract_json(raw)
    except (PersonaSceneError, QwenError):
        return fallback

    bg = str(parsed.get("backgroundAdditions") or parsed.get("background_additions") or "").strip()
    compose = str(parsed.get("composeGuidance") or parsed.get("compose_guidance") or "").strip()
    if not bg:
        bg = fallback.background_additions
    if not compose:
        compose = fallback.compose_guidance
    try:
        person_h = float(parsed.get("personHeightRatio", fallback.person_height_ratio))
    except (TypeError, ValueError):
        person_h = fallback.person_height_ratio
    try:
        bottom = float(parsed.get("bottomMarginRatio", fallback.bottom_margin_ratio))
    except (TypeError, ValueError):
        bottom = fallback.bottom_margin_ratio
    try:
        feather = int(parsed.get("edgeFeatherPx", fallback.edge_feather_px))
    except (TypeError, ValueError):
        feather = fallback.edge_feather_px

    merged_suggestions = tuple(dict.fromkeys([*suggestions, *(compose.split("；") if compose else [])]))
    return RegenerationPlan(
        background_additions=bg,
        compose_guidance=compose,
        person_height_ratio=_clamp(person_h, 0.55, 0.88),
        bottom_margin_ratio=_clamp(bottom, 0.02, 0.15),
        edge_feather_px=max(0, min(8, feather)),
        fix_suggestions=merged_suggestions,
    )


def split_visual_action_and_scene(visual_description: str) -> tuple[str, str]:
    """Split decomposed visual into character action vs scene background."""
    text = visual_description.strip()
    if not text:
        return "", ""

    match = re.search(r"[，,]\s*背景[为是：:\s]+(.+)$", text)
    if match:
        scene = match.group(1).strip().rstrip("，。；")
        action = text[: match.start()].strip().rstrip("，,")
        return action, scene

    match = re.search(r"背景[为是：:\s]+(.+)$", text)
    if match:
        scene = match.group(1).strip()
        action = text[: match.start()].strip().rstrip("，,")
        return action, scene

    return text, ""


def _wanx_size(aspect_ratio: str) -> str:
    model = (settings.wanx_model or "wan2.2-t2i-flash").lower()
    if model.startswith("wan2.") or model.startswith("wanx2."):
        return "1280*1280"
    return "1280*720" if aspect_ratio == "16:9" else "720*1280"


def _wanx_input(prompt: str) -> dict[str, str]:
    model = (settings.wanx_model or "wan2.2-t2i-flash").lower()
    data: dict[str, str] = {"prompt": prompt}
    if not model.startswith("wanx-v1"):
        data["negative_prompt"] = "人物, 人脸, 人体, 行人"
    return data


def _scene_background_prompt(
    scene_description: str,
    *,
    regen_plan: RegenerationPlan | None = None,
) -> str:
    base = (
        f"短视频实拍风格室内空镜背景，画面中没有任何人物，"
        f"{scene_description}，柔和自然光，高清细节，适合口播视频背景"
    )
    if not regen_plan or not regen_plan.background_additions.strip():
        return base
    return f"{base}。{regen_plan.background_additions.strip()}"


async def _download_image_bytes(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.content


async def _submit_wanx_task(
    *,
    prompt: str,
    size: str,
    model: str | None = None,
    ref_img: str | None = None,
    ref_strength: float = 0.9,
    ref_mode: str = "repaint",
    negative_prompt: str | None = None,
    style: str | None = None,
) -> str:
    api_key = _require_api_key()
    base_url = dashscope_native_base()
    resolved_model = model or settings.wanx_model or "wan2.2-t2i-flash"
    if ref_img:
        input_data: dict[str, str] = {"prompt": prompt, "ref_img": ref_img}
        if negative_prompt:
            input_data["negative_prompt"] = negative_prompt
    else:
        input_data = _wanx_input(prompt)
        if negative_prompt:
            input_data["negative_prompt"] = negative_prompt
    parameters: dict[str, Any] = {"size": size, "n": 1}
    if ref_img:
        parameters["ref_strength"] = ref_strength
        parameters["ref_mode"] = ref_mode
        if style:
            parameters["style"] = style
    payload = {
        "model": resolved_model,
        "input": input_data,
        "parameters": parameters,
    }
    url = f"{base_url}{WANX_IMAGE_SYNTHESIS}"
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "X-DashScope-Async": "enable",
            },
            json=payload,
        )
    if response.status_code >= 400:
        detail = response.text.strip() or response.reason_phrase
        raise PersonaSceneError(
            f"万相背景生成失败 ({response.status_code}): {detail or url}"
        )
    data = response.json()
    task_id = (data.get("output") or {}).get("task_id") or data.get("task_id")
    if not task_id:
        raise PersonaSceneError("万相背景生成未返回 task_id")
    return str(task_id)


async def _poll_wanx_task(task_id: str, *, max_wait_sec: int = 120) -> str:
    api_key = _require_api_key()
    base_url = dashscope_native_base()
    deadline = time.monotonic() + max_wait_sec
    task_url = f"{base_url}/api/v1/tasks/{task_id}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        while time.monotonic() < deadline:
            response = await client.get(
                task_url,
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if response.status_code >= 400:
                raise PersonaSceneError(f"万相任务查询失败 ({response.status_code})")
            data = response.json()
            output = data.get("output") or {}
            status = output.get("task_status") or data.get("task_status")
            if status == "SUCCEEDED":
                results = output.get("results") or []
                if results and results[0].get("url"):
                    return str(results[0]["url"])
                raise PersonaSceneError("万相背景生成成功但未返回图片 URL")
            if status in {"FAILED", "CANCELED"}:
                message = output.get("message") or data.get("message") or "万相背景生成失败"
                raise PersonaSceneError(message)
            await asyncio.sleep(2)
    raise PersonaSceneError("万相背景生成超时")


async def generate_scene_background_bytes(
    scene_description: str,
    *,
    aspect_ratio: str = "16:9",
    regen_plan: RegenerationPlan | None = None,
) -> bytes:
    if not scene_description.strip():
        raise PersonaSceneError("缺少场景描述，无法生成背景")
    try:
        _require_api_key()
    except QwenError as exc:
        raise PersonaSceneError(str(exc)) from exc
    prompt = _scene_background_prompt(scene_description.strip(), regen_plan=regen_plan)
    task_id = await _submit_wanx_task(prompt=prompt, size=_wanx_size(aspect_ratio))
    image_url = await _poll_wanx_task(task_id)
    return await _download_image_bytes(image_url)


def _matte_persona_bytes(image_bytes: bytes) -> bytes:
    try:
        from rembg import remove  # type: ignore[import-untyped]
        from PIL import Image
    except ImportError as exc:
        raise PersonaSceneError("未安装 rembg / Pillow，无法抠图。请在后端执行 pip install rembg pillow") from exc

    result = remove(image_bytes)
    if isinstance(result, bytes):
        return result
    buffer = io.BytesIO()
    result.save(buffer, format="PNG")
    return buffer.getvalue()


async def matte_persona_from_url(image_url: str, *, cos_key: str | None = None) -> bytes:
    resolved = await resolve_kling_image(image_url, cos_key=cos_key)
    import base64

    raw = base64.b64decode(resolved)
    return await asyncio.to_thread(_matte_persona_bytes, raw)


def _upper_body_portrait_prompt(
    *,
    persona_name: str,
    persona_description: str | None,
    action_description: str,
    regen_plan: RegenerationPlan | None = None,
) -> str:
    action = (action_description or "自然口播").strip()
    desc = (persona_description or "").strip()
    parts = [
        f"写实摄影风格，{persona_name}正面直立面向镜头，完整上半身清晰可见，"
        f"专业柔和布光，简洁虚化背景便于抠图，高清细节，真实肤色。",
        f"动作：{action}。",
    ]
    if desc:
        parts.append(desc)
    if regen_plan and regen_plan.compose_guidance.strip():
        parts.append(regen_plan.compose_guidance.strip())
    return " ".join(parts)


async def generate_upper_body_from_face_ref(
    face_image_url: str,
    *,
    persona_name: str,
    persona_description: str | None = None,
    action_description: str = "",
    aspect_ratio: str = "16:9",
    regen_plan: RegenerationPlan | None = None,
) -> bytes:
    """以提取的人脸为参考，生成正面直立上半身肖像，再抠图用于合成。"""
    try:
        _require_api_key()
    except QwenError as exc:
        raise PersonaSceneError(str(exc)) from exc
    prompt = _upper_body_portrait_prompt(
        persona_name=persona_name,
        persona_description=persona_description,
        action_description=action_description,
        regen_plan=regen_plan,
    )
    size = "720*1280" if aspect_ratio == "9:16" else "1280*720"
    task_id = await _submit_wanx_task(
        prompt=prompt,
        size=size,
        model=WANX_PORTRAIT_MODEL,
        ref_img=face_image_url,
        ref_strength=0.92,
        ref_mode="repaint",
        style="<portrait>",
        negative_prompt="侧脸，躺卧，横向，残缺身体，多余肢体，变形，低质量，模糊",
    )
    image_url = await _poll_wanx_task(task_id, max_wait_sec=180)
    raw = await _download_image_bytes(image_url)
    return await asyncio.to_thread(_matte_persona_bytes, raw)


def _feather_person_alpha(person: "Image.Image", radius: int) -> "Image.Image":
    from PIL import ImageFilter

    if radius <= 0:
        return person
    alpha = person.split()[3]
    alpha = alpha.filter(ImageFilter.GaussianBlur(radius=radius))
    person.putalpha(alpha)
    return person


def compose_person_on_background(
    background_bytes: bytes,
    person_rgba_bytes: bytes,
    *,
    aspect_ratio: str = "16:9",
    hints: ComposeHints | None = None,
) -> bytes:
    try:
        from PIL import Image
    except ImportError as exc:
        raise PersonaSceneError("未安装 Pillow，无法合成场景首帧") from exc

    compose = hints or ComposeHints()
    target_w, target_h = (1280, 720) if aspect_ratio == "16:9" else (720, 1280)
    bg = Image.open(io.BytesIO(background_bytes)).convert("RGBA").resize(
        (target_w, target_h), Image.Resampling.LANCZOS
    )
    person = Image.open(io.BytesIO(person_rgba_bytes)).convert("RGBA")
    person = _feather_person_alpha(person, compose.edge_feather_px)
    person_h = int(target_h * compose.person_height_ratio)
    scale = person_h / max(person.height, 1)
    person_w = max(1, int(person.width * scale))
    person = person.resize((person_w, person_h), Image.Resampling.LANCZOS)
    x = (target_w - person_w) // 2
    y = target_h - person_h - int(target_h * compose.bottom_margin_ratio)
    bg.alpha_composite(person, (x, y))
    out = io.BytesIO()
    bg.convert("RGB").save(out, format="PNG")
    return out.getvalue()


def build_script_scene_frame_key(script_id: int, segment_index: int) -> str:
    return f"scripts/{script_id}/segments/{segment_index}/scene-frame-{int(time.time() * 1000)}.png"


async def build_segment_scene_frame(
    *,
    script_id: int,
    segment_index: int,
    persona_image_url: str,
    persona_image_key: str | None,
    scene_description: str,
    aspect_ratio: str = "16:9",
    action_description: str = "",
    persona_name: str = "",
    persona_description: str | None = None,
    regen_plan: RegenerationPlan | None = None,
) -> dict[str, Any]:
    """VL 规划 + 图像编辑一体生成人物与场景融合的首帧（非抠图粘贴）。"""
    del persona_image_key
    regen_bg = regen_plan.background_additions if regen_plan else ""
    regen_compose = regen_plan.compose_guidance if regen_plan else ""
    try:
        edit_plan = await plan_first_frame_edit(
            face_image_url=persona_image_url,
            persona_name=persona_name or "出镜者",
            scene=scene_description,
            action=action_description,
            persona_description=persona_description,
            regen_additions=regen_bg,
            regen_compose=regen_compose,
        )
        frame_bytes = await generate_integrated_first_frame(
            persona_image_url,
            instruction=edit_plan["edit_instruction"],
            negative_prompt=edit_plan["negative_prompt"],
            aspect_ratio=aspect_ratio,
        )
    except QwenError as exc:
        raise PersonaSceneError(str(exc)) from exc
    key = build_script_scene_frame_key(script_id, segment_index)
    uploaded = await upload_image_bytes(frame_bytes, key=key, content_type="image/png")
    result: dict[str, Any] = {
        "key": key,
        "url": uploaded["url"],
        "public_url": public_url(key),
    }
    if regen_plan:
        result["regenPlan"] = {
            "backgroundAdditions": regen_plan.background_additions,
            "composeGuidance": regen_plan.compose_guidance,
            "fixSuggestions": list(regen_plan.fix_suggestions),
        }
    return result


async def review_composed_frame(
    *,
    frame_url: str,
    persona_name: str,
    scene_description: str,
    action_description: str,
    persona_description: str | None = None,
) -> dict[str, Any]:
    """Use Qwen-VL to validate a composed first frame against script requirements."""
    api_key = _require_api_key()
    model = settings.qwen_vl_model or "qwen-vl-max"
    base_url = dashscope_compatible_base()
    persona_hint = f"，{persona_description}" if persona_description else ""
    prompt = FRAME_REVIEW_PROMPT.format(
        persona_name=persona_name,
        persona_hint=persona_hint,
        scene_description=scene_description,
        action_description=action_description or "出镜口播",
    )
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": frame_url}},
                    {"type": "text", "text": prompt},
                ],
            }
        ],
        "temperature": 0.1,
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
        )
    if response.status_code >= 400:
        raise PersonaSceneError(f"首帧质检失败 ({response.status_code}): {response.text.strip()}")
    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise PersonaSceneError("首帧质检未返回结果")
    text = (choices[0].get("message") or {}).get("content", "")
    if not text.strip():
        raise PersonaSceneError("首帧质检返回空内容")
    try:
        parsed = _extract_json(text)
    except QwenError as exc:
        raise PersonaSceneError(f"首帧质检结果解析失败: {exc}") from exc
    except Exception as exc:
        raise PersonaSceneError(f"首帧质检结果解析失败: {exc}") from exc
    passed = bool(parsed.get("passed"))
    score_raw = parsed.get("score", 0)
    try:
        score = int(score_raw)
    except (TypeError, ValueError):
        score = 0
    issues = parsed.get("issues") if isinstance(parsed.get("issues"), list) else []
    fix_raw = parsed.get("fixSuggestions") or parsed.get("fix_suggestions") or []
    fix_suggestions = [str(item).strip() for item in fix_raw if str(item).strip()] if isinstance(fix_raw, list) else []
    summary = str(parsed.get("summary") or "").strip()
    if score >= 70 and not passed:
        passed = True
    return {
        "passed": passed,
        "score": max(0, min(100, score)),
        "issues": [str(item) for item in issues if item],
        "summary": summary or ("通过" if passed else "未通过"),
        "fixSuggestions": fix_suggestions,
    }


async def prepare_and_validate_segment_frame(
    *,
    script_id: int,
    segment_index: int,
    persona_image_url: str,
    persona_image_key: str | None,
    visual_description: str,
    persona_name: str,
    persona_description: str | None = None,
    aspect_ratio: str = "16:9",
    max_attempts: int = 2,
    review_issues: list[str] | None = None,
    review_summary: str = "",
    fix_suggestions: list[str] | None = None,
) -> dict[str, Any]:
    """Image processing + VL review; retry background generation if review fails."""
    action, scene = split_visual_action_and_scene(visual_description)
    if not scene.strip():
        scene = DEFAULT_STUDIO_SCENE

    last_frame: dict[str, Any] | None = None
    last_review: dict[str, Any] | None = None
    regen_plan: RegenerationPlan | None = None
    if review_issues or review_summary.strip() or fix_suggestions:
        regen_plan = await build_regeneration_plan(
            scene=scene,
            action=action,
            persona_name=persona_name,
            review_issues=review_issues,
            review_summary=review_summary,
            fix_suggestions=fix_suggestions,
        )

    for attempt in range(max(1, max_attempts)):
        frame = await build_segment_scene_frame(
            script_id=script_id,
            segment_index=segment_index,
            persona_image_url=persona_image_url,
            persona_image_key=persona_image_key,
            scene_description=scene,
            aspect_ratio=aspect_ratio,
            action_description=action,
            persona_name=persona_name,
            persona_description=persona_description,
            regen_plan=regen_plan,
        )
        review = await review_composed_frame(
            frame_url=frame["public_url"],
            persona_name=persona_name,
            scene_description=scene,
            action_description=action,
            persona_description=persona_description,
        )
        last_frame = frame
        last_review = review
        if review["passed"]:
            break
        if attempt + 1 < max_attempts:
            regen_plan = await build_regeneration_plan(
                scene=scene,
                action=action,
                persona_name=persona_name,
                review_issues=list(review.get("issues") or []),
                review_summary=str(review.get("summary") or ""),
                fix_suggestions=list(review.get("fixSuggestions") or []),
            )

    assert last_frame is not None and last_review is not None
    return {
        **last_frame,
        "review": last_review,
        "action": action,
        "scene": scene,
        "appliedReviewFeedback": bool(review_issues or review_summary or fix_suggestions),
        "regenPlan": {
            "backgroundAdditions": regen_plan.background_additions,
            "composeGuidance": regen_plan.compose_guidance,
            "fixSuggestions": list(regen_plan.fix_suggestions),
        }
        if regen_plan
        else None,
    }
