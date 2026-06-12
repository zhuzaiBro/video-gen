"""Rotate reference images for artboard persona refs before Kling generation."""

from __future__ import annotations

import asyncio
import base64
import io
import time

from app.services.cos import upload_image_bytes
from app.services.kling_image import resolve_kling_image

ALLOWED_ROTATIONS = frozenset({0, 90, 180, 270})


def normalize_rotation(degrees: int | float | str | None) -> int:
    try:
        value = int(degrees or 0) % 360
    except (TypeError, ValueError):
        return 0
    if value < 0:
        value += 360
    return value if value in ALLOWED_ROTATIONS else 0


def rotate_image_bytes(image_bytes: bytes, degrees: int) -> bytes:
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("未安装 Pillow，无法旋转图片") from exc

    rotation = normalize_rotation(degrees)
    if rotation == 0:
        return image_bytes

    img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    rotated = img.rotate(-rotation, expand=True, resample=Image.Resampling.BICUBIC)
    out = io.BytesIO()
    rotated.save(out, format="PNG")
    return out.getvalue()


async def apply_rotation_to_reference(
    image_url: str,
    image_key: str | None,
    degrees: int,
    *,
    persona_id: int,
) -> tuple[str, str | None]:
    rotation = normalize_rotation(degrees)
    if rotation == 0:
        return image_url, image_key

    encoded = await resolve_kling_image(image_url, cos_key=image_key)
    raw = base64.b64decode(encoded)
    rotated = await asyncio.to_thread(rotate_image_bytes, raw, rotation)
    key = f"personas/{persona_id}/rotated-{rotation}-{int(time.time() * 1000)}.png"
    uploaded = await upload_image_bytes(rotated, key=key, content_type="image/png")
    return uploaded["url"], key
