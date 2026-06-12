"""Extract face cutouts via LLM: VL plan + image edit + VL review."""

from __future__ import annotations

import asyncio
import io
import time
from typing import TYPE_CHECKING

from app.services.cos import build_persona_extract_key, delete_file, upload_image_bytes
from app.services.kling_image import resolve_kling_image
from app.services.persona_scene import PersonaSceneError, _matte_persona_bytes
from app.services.qwen import QwenError, extract_face_portrait_with_llm

if TYPE_CHECKING:
    from app.models import ReferenceImage


class PersonaExtractError(Exception):
    pass


def _pad_to_square(img: "Image.Image", *, padding_ratio: float = 0.06) -> "Image.Image":
    from PIL import Image

    width, height = img.size
    size = max(width, height)
    pad = int(size * padding_ratio)
    canvas_size = size + pad * 2
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    x = (canvas_size - width) // 2
    y = (canvas_size - height) // 2
    canvas.paste(img, (x, y), img)
    return canvas


def _resize_long_edge(img: "Image.Image", max_edge: int) -> "Image.Image":
    from PIL import Image

    width, height = img.size
    long_edge = max(width, height)
    if long_edge <= max_edge:
        return img
    scale = max_edge / long_edge
    new_size = (max(1, int(width * scale)), max(1, int(height * scale)))
    return img.resize(new_size, Image.Resampling.LANCZOS)


def _trim_alpha_bounds(img: "Image.Image") -> "Image.Image":
    from PIL import Image

    if img.mode != "RGBA":
        return img
    alpha = img.split()[3]
    bbox = alpha.getbbox()
    if not bbox:
        return img
    return img.crop(bbox)


def _finalize_face_png(raw_bytes: bytes) -> bytes:
    try:
        from PIL import Image
    except ImportError as exc:
        raise PersonaExtractError("未安装 Pillow，无法处理人脸图") from exc

    try:
        matted = _matte_persona_bytes(raw_bytes)
        face = Image.open(io.BytesIO(matted)).convert("RGBA")
    except PersonaSceneError:
        face = Image.open(io.BytesIO(raw_bytes)).convert("RGBA")
    face = _trim_alpha_bounds(face)
    face = _pad_to_square(face)
    face = _resize_long_edge(face, 768)
    out = io.BytesIO()
    face.save(out, format="PNG")
    return out.getvalue()


async def delete_reference_extract_assets(image: ReferenceImage) -> None:
    for key in (image.face_crop_key, image.body_crop_key):
        if not key:
            continue
        try:
            await delete_file(key)
        except Exception:
            pass


async def extract_digital_human_assets(image: ReferenceImage) -> ReferenceImage:
    shot_type = (image.shot_type or "other").strip()

    try:
        face_raw = await extract_face_portrait_with_llm(
            image_url=image.image_url,
            shot_type=shot_type,
            max_attempts=2,
        )
    except QwenError as exc:
        raise PersonaExtractError(str(exc)) from exc

    try:
        face_bytes = await asyncio.to_thread(_finalize_face_png, face_raw)
    except PersonaExtractError:
        raise
    except Exception as exc:
        raise PersonaExtractError(f"处理人脸图失败: {exc}") from exc

    await delete_reference_extract_assets(image)

    ts = int(time.time() * 1000)
    face_key = build_persona_extract_key(image.persona_id, image.id, "face", ts=ts)
    face_uploaded = await upload_image_bytes(face_bytes, key=face_key, content_type="image/png")

    image.face_crop_key = face_key
    image.face_crop_url = face_uploaded["url"]
    image.body_crop_key = None
    image.body_crop_url = None
    return image
