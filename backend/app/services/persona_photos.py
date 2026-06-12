"""Persona reference photo shot types, expressions, and selection for video generation."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models import ReferenceImage

SHOT_TYPE_ORDER = ("front_face", "side_face", "body", "other")
KLING_REFERENCE_IMAGE_LIMIT = 4

EXPRESSION_TONE_PROMPTS: dict[str, str] = {
    "subtle_natural": (
        "Facial expression: natural and relaxed; use only subtle micro-expressions. "
        "No exaggerated smiles, wide eyes, or dramatic gestures."
    ),
    "subtle_smile": (
        "Facial expression: a gentle slight smile with soft eyes; warm but restrained. "
        "Never a big laugh or wide open-mouth grin."
    ),
    "calm_serious": (
        "Facial expression: calm and composed, minimal movement; professional and steady. "
        "Avoid playful or over-animated expressions."
    ),
    "focused_talk": (
        "Facial expression: focused while speaking, steady gaze, small nods only. "
        "Hand gestures should be subtle and limited."
    ),
}

PHOTO_EXPRESSION_HINTS: dict[str, str] = {
    "neutral": "neutral relaxed face",
    "slight_smile": "slight gentle smile",
    "calm": "calm composed look",
    "focused": "focused attentive look",
}


def resolve_expression_prompt(
    expression_tone: str | None,
    *,
    expression_notes: str | None = None,
) -> str:
    tone = (expression_tone or "subtle_natural").strip()
    base = EXPRESSION_TONE_PROMPTS.get(tone, EXPRESSION_TONE_PROMPTS["subtle_natural"])
    notes = (expression_notes or "").strip()
    if notes:
        return f"{base} Additional expression direction: {notes}."
    return base


def _shot_rank(shot_type: str | None) -> int:
    value = (shot_type or "other").strip()
    try:
        return SHOT_TYPE_ORDER.index(value)
    except ValueError:
        return len(SHOT_TYPE_ORDER)


def sort_reference_images_for_kling(images: list[ReferenceImage]) -> list[ReferenceImage]:
    return sorted(images, key=lambda img: (_shot_rank(img.shot_type), img.id))


def pick_reference_image_by_shot(
    images: list[ReferenceImage],
    shot_type: str,
) -> ReferenceImage | None:
    for image in images:
        if (image.shot_type or "other") == shot_type:
            return image
    return None


def select_kling_reference_images(
    images: list[ReferenceImage],
    *,
    max_count: int = KLING_REFERENCE_IMAGE_LIMIT,
) -> list[ReferenceImage]:
    if not images:
        return []
    selected: list[ReferenceImage] = []
    for shot in SHOT_TYPE_ORDER:
        if len(selected) >= max_count:
            break
        match = pick_reference_image_by_shot(images, shot)
        if match and match not in selected:
            selected.append(match)
    for image in sort_reference_images_for_kling(images):
        if image in selected:
            continue
        selected.append(image)
        if len(selected) >= max_count:
            break
    return selected[:max_count]


SHOT_TYPE_LABELS: dict[str, str] = {
    "front_face": "正脸",
    "side_face": "侧脸",
    "body": "身材",
    "other": "参考",
}


KLING_POSE_ORIENTATION_HINT = (
    "【画面朝向】人物必须直立，正面朝向镜头，头部在上、身体在下；"
    "完整上半身或全身须可见。禁止侧躺、横向旋转、倒立或仅漂浮头部。"
)

FACE_IDENTITY_REFERENCE_HINT = (
    "【参考图用法】完整原照决定身体姿态、构图与画面朝向；"
    "人脸特写照仅锁定五官与发型，须融合到完整身体上，禁止身体残缺。"
)


def describe_body_profile(height_cm: int | None, weight_kg: int | None) -> str | None:
    parts: list[str] = []
    if height_cm:
        parts.append(f"身高约 {height_cm} cm")
    if weight_kg:
        parts.append(f"体重约 {weight_kg} kg")
    if not parts:
        return None
    return "体态参数：" + "，".join(parts) + "。生成时须保持该身材比例。"


def _append_kling_slot(
    slots: list[tuple[str, ReferenceImage]],
    kind: str,
    image: ReferenceImage | None,
    *,
    max_count: int,
) -> None:
    if not image or len(slots) >= max_count:
        return
    if kind == "face":
        if not image.face_crop_url:
            return
        if any(slot_kind == "face" and img.id == image.id for slot_kind, img in slots):
            return
    elif any(slot_kind == "original" and img.id == image.id for slot_kind, img in slots):
        return
    slots.append((kind, image))


def build_kling_reference_slots(
    images: list[ReferenceImage],
    *,
    max_count: int = KLING_REFERENCE_IMAGE_LIMIT,
) -> list[tuple[str, ReferenceImage]]:
    if not images:
        return []

    slots: list[tuple[str, ReferenceImage]] = []
    sorted_imgs = sort_reference_images_for_kling(images)
    front = pick_reference_image_by_shot(sorted_imgs, "front_face")
    if front:
        _append_kling_slot(slots, "original", front, max_count=max_count)
        _append_kling_slot(slots, "face", front, max_count=max_count)

    for image in sorted_imgs:
        if front and image.id == front.id:
            continue
        _append_kling_slot(slots, "original", image, max_count=max_count)

    for image in sorted_imgs:
        if front and image.id == front.id:
            continue
        if (image.shot_type or "other") in {"front_face", "side_face"}:
            _append_kling_slot(slots, "face", image, max_count=max_count)

    return slots[:max_count]


def build_kling_reference_lists(
    images: list[ReferenceImage],
    *,
    max_count: int = KLING_REFERENCE_IMAGE_LIMIT,
) -> tuple[list[str], list[str | None]]:
    """原图优先（身体+朝向），人脸抠图作补充（五官），避免只传头部导致残缺/侧躺。"""
    urls: list[str] = []
    keys: list[str | None] = []
    for kind, image in build_kling_reference_slots(images, max_count=max_count):
        if kind == "face":
            urls.append(image.face_crop_url or image.image_url)
            keys.append(image.face_crop_key or image.image_key)
        else:
            urls.append(image.image_url)
            keys.append(image.image_key)
    return urls, keys


async def resolve_rotated_kling_references(
    images: list[ReferenceImage],
    all_images: list[ReferenceImage],
    rotations: dict | None,
    *,
    persona_id: int,
    max_count: int = KLING_REFERENCE_IMAGE_LIMIT,
) -> tuple[list[str], list[str | None]]:
    from app.services.image_rotate import apply_rotation_to_reference, normalize_rotation

    index_by_id = {img.id: idx for idx, img in enumerate(all_images)}
    rotation_map = rotations if isinstance(rotations, dict) else {}
    urls: list[str] = []
    keys: list[str | None] = []
    for kind, image in build_kling_reference_slots(images, max_count=max_count):
        if kind == "face":
            url = image.face_crop_url or image.image_url
            key = image.face_crop_key or image.image_key
        else:
            url = image.image_url
            key = image.image_key
        img_idx = index_by_id.get(image.id, 0)
        rotation = normalize_rotation(rotation_map.get(str(img_idx)) or rotation_map.get(img_idx))
        if rotation:
            url, key = await apply_rotation_to_reference(url, key, rotation, persona_id=persona_id)
        urls.append(url)
        keys.append(key)
    return urls, keys


def kling_reference_lists(
    images: list[ReferenceImage],
) -> tuple[list[str], list[str | None]]:
    return build_kling_reference_lists(images)


def portrait_for_scene_compose(image: ReferenceImage) -> tuple[str, str | None]:
    """合成首屏时使用已提取的人脸抠图。"""
    return image.face_crop_url or image.image_url, image.face_crop_key or image.image_key


def resolve_portrait_for_first_screen(
    reference_images: list[ReferenceImage],
    ff_config: dict,
) -> ReferenceImage:
    """首屏人设：优先画板所选参考图，且必须已提取人脸。"""
    from app.services.persona_scene import PersonaSceneError
    from app.services.script_segments import resolve_persona_reference_images

    selected = resolve_persona_reference_images(reference_images, ff_config)
    image = selected[0] if selected else reference_images[0]
    if image.face_crop_url:
        return image
    front = pick_reference_image_by_shot(reference_images, "front_face")
    if front and front.face_crop_url:
        return front
    for candidate in reference_images:
        if candidate.face_crop_url:
            return candidate
    raise PersonaSceneError("请先在「人设」页为参考图提取人脸，再生成口播首屏")


def resolve_face_source_for_first_screen(image: ReferenceImage) -> tuple[str, str | None]:
    """首屏素材：仅使用已提取的人脸抠图，不用原图。"""
    from app.services.persona_scene import PersonaSceneError

    if not image.face_crop_url:
        raise PersonaSceneError("所选参考图尚未提取人脸，请先在「人设」页点击「提取人脸」")
    return image.face_crop_url, image.face_crop_key


async def resolve_matte_source_for_first_screen(
    image: ReferenceImage,
    *,
    rotation: int = 0,
    persona_id: int,
) -> tuple[str, str | None]:
    """兼容旧调用：首屏统一走人脸抠图。"""
    del rotation, persona_id
    return resolve_face_source_for_first_screen(image)


def face_identity_hint_for_first_screen(image: ReferenceImage | None) -> str | None:
    if not image or not image.face_crop_url:
        return None
    return "首屏由提取人脸扩展生成；人物须正面直立、完整上半身，五官发型与该人脸完全一致。"


def describe_protagonist_reference_images(
    images: list[ReferenceImage],
    persona_name: str,
    *,
    body_profile_hint: str | None = None,
) -> str | None:
    if not images:
        return None
    body_suffix = f" {body_profile_hint}" if body_profile_hint else ""
    if len(images) == 1:
        shot = SHOT_TYPE_LABELS.get((images[0].shot_type or "other").strip(), "参考")
        has_face = bool(images[0].face_crop_url)
        ref_note = "（原照定姿态与朝向，人脸特写定五官）" if has_face else ""
        return (
            f"【主角形象】出镜者即主角 {persona_name}，须与参考图（{shot}）{ref_note}五官、发型、穿搭与体态一致。"
            f"{body_suffix}"
        )
    labels: list[str] = []
    for idx, image in enumerate(images, start=1):
        shot = SHOT_TYPE_LABELS.get((image.shot_type or "other").strip(), "参考")
        labels.append(f"参考图{idx}({shot})")
    joined = "、".join(labels)
    has_face = any(img.face_crop_url for img in images)
    ref_note = "完整原照定身体与朝向，人脸特写定五官；" if has_face else ""
    return (
        f"【主角形象】以下多张参考图共同定义主角 {persona_name} 的外貌：{joined}。"
        f"{ref_note}须保持同一人、同一发型穿搭与体态；正脸原照定口播朝向，侧脸/身材辅助轮廓与比例。"
        f"{body_suffix}出镜者必须是这位主角，勿换成他人。"
    )


def build_persona_media_bundle(persona, images: list[ReferenceImage]) -> dict:
    selected = select_kling_reference_images(images)
    primary = pick_reference_image_by_shot(images, "front_face") or (selected[0] if selected else None)
    body_profile_hint = describe_body_profile(
        getattr(persona, "height_cm", None),
        getattr(persona, "weight_kg", None),
    )
    reference_urls, reference_keys = build_kling_reference_lists(selected)
    return {
        "reference_image_urls": reference_urls,
        "reference_image_keys": reference_keys,
        "reference_expression_hint": reference_image_expression_hint(selected),
        "protagonist_reference_hint": describe_protagonist_reference_images(
            selected,
            persona.name,
            body_profile_hint=body_profile_hint,
        ),
        "body_profile_hint": body_profile_hint,
        "pose_orientation_hint": KLING_POSE_ORIENTATION_HINT,
        "face_identity_hint": FACE_IDENTITY_REFERENCE_HINT,
        "expression_tone": persona.expression_tone,
        "expression_notes": persona.expression_notes,
        "primary_image": primary,
    }


def reference_image_expression_hint(images: list[ReferenceImage]) -> str | None:
    hints: list[str] = []
    for image in images:
        expr = (image.expression or "neutral").strip()
        label = PHOTO_EXPRESSION_HINTS.get(expr)
        shot = image.shot_type or "other"
        if label and shot in {"front_face", "side_face"}:
            hints.append(f"{shot.replace('_', ' ')} reference shows {label}")
    if not hints:
        return None
    return "Reference photo cues: " + "; ".join(hints[:3]) + "."
