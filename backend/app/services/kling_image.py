import base64
import binascii
import re

import httpx

from app.services.cos import get_signed_url

_DATA_URI_RE = re.compile(r"^data:image/[\w+.-]+;base64,(.+)$", re.I)
_BASE64_RE = re.compile(r"^[A-Za-z0-9+/=\s]+$")


async def resolve_kling_image(image: str, *, cos_key: str | None = None) -> str:
    """Normalize image input to raw base64 for Kling image2video APIs."""
    value = image.strip()
    if not value:
        raise ValueError("参考图为空")

    if value.startswith("blob:"):
        raise ValueError("参考图不能使用浏览器本地地址，请重新选择图片后再试")

    match = _DATA_URI_RE.match(value)
    if match:
        return _validate_base64(match.group(1))

    if value.startswith(("http://", "https://")):
        url = await get_signed_url(cos_key, expires_in=3600) if cos_key else value
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            content_type = response.headers.get("content-type", "")
            if content_type and not content_type.startswith("image/"):
                raise ValueError(f"参考图不是有效图片 ({content_type})")
            return base64.b64encode(response.content).decode("ascii")

    return _validate_base64(value)


def _validate_base64(value: str) -> str:
    cleaned = value.strip()
    if not _BASE64_RE.fullmatch(cleaned):
        raise ValueError("参考图 base64 格式无效")
    try:
        base64.b64decode(cleaned, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("参考图 base64 格式无效") from exc
    return cleaned
