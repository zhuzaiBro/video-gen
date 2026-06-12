import asyncio
import mimetypes
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from qcloud_cos import CosConfig, CosS3Client

from app.config import settings

_client: CosS3Client | None = None
_client_fingerprint: str | None = None
_env_loaded = False


class CosNotConfiguredError(Exception):
    pass


def _ensure_env_loaded() -> None:
    global _env_loaded
    if _env_loaded:
        return
    backend_dir = Path(__file__).resolve().parents[2]
    root_dir = backend_dir.parent
    load_dotenv(backend_dir / ".env")
    load_dotenv(root_dir / ".env", override=True)
    _env_loaded = True


def _resolve_cos_config() -> dict[str, str]:
    _ensure_env_loaded()
    return {
        "secret_id": (os.getenv("TENCENT_COS_SECRET_ID") or settings.tencent_cos_secret_id or "").strip(),
        "secret_key": (os.getenv("TENCENT_COS_SECRET_KEY") or settings.tencent_cos_secret_key or "").strip(),
        "bucket": (os.getenv("TENCENT_COS_BUCKET") or settings.tencent_cos_bucket or "").strip(),
        "region": (os.getenv("TENCENT_COS_REGION") or settings.tencent_cos_region or "ap-shanghai").strip(),
        "cdn_url": (
            os.getenv("TENCENT_COS_CDN_URL")
            or os.getenv("TENCENT_COS_URL")
            or settings.tencent_cos_cdn_url
            or ""
        ).strip(),
    }


def _get_client() -> CosS3Client:
    global _client, _client_fingerprint
    cfg = _resolve_cos_config()
    if not cfg["secret_id"] or not cfg["secret_key"]:
        raise CosNotConfiguredError("腾讯云 COS 未配置，请在 .env 填写 TENCENT_COS_SECRET_ID / TENCENT_COS_SECRET_KEY")
    if not cfg["bucket"]:
        raise CosNotConfiguredError("腾讯云 COS 未配置，请在 .env 填写 TENCENT_COS_BUCKET")

    fingerprint = f"{cfg['secret_id']}:{cfg['bucket']}:{cfg['region']}"
    if _client is None or _client_fingerprint != fingerprint:
        cos_config = CosConfig(
            Region=cfg["region"],
            SecretId=cfg["secret_id"],
            SecretKey=cfg["secret_key"],
        )
        _client = CosS3Client(cos_config)
        _client_fingerprint = fingerprint
    return _client


def public_url(key: str) -> str:
    cfg = _resolve_cos_config()
    if cfg["cdn_url"]:
        return f"{cfg['cdn_url'].rstrip('/')}/{key}"
    return f"https://{cfg['bucket']}.cos.{cfg['region']}.myqcloud.com/{key}"


def _guess_content_type(filename: str) -> str:
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or "image/jpeg"


def _sanitize_filename(filename: str) -> str:
    name = os.path.basename(filename).strip() or "image.jpg"
    return "".join(c if c.isalnum() or c in "._-" else "_" for c in name)[:120]


def build_persona_image_key(persona_id: int, filename: str) -> str:
    safe_name = _sanitize_filename(filename)
    return f"personas/{persona_id}/{int(time.time() * 1000)}-{safe_name}"


def build_persona_voice_key(persona_id: int, filename: str) -> str:
    safe_name = _sanitize_filename(filename)
    return f"personas/{persona_id}/voice-{int(time.time() * 1000)}-{safe_name}"


def build_persona_extract_key(persona_id: int, image_id: int, kind: str, *, ts: int | None = None) -> str:
    stamp = ts if ts is not None else int(time.time() * 1000)
    safe_kind = "face" if kind == "face" else "body"
    return f"personas/{persona_id}/extracted/{safe_kind}-{image_id}-{stamp}.png"


def build_script_artboard_key(script_id: int, segment_index: int, filename: str) -> str:
    safe_name = _sanitize_filename(filename)
    return f"scripts/{script_id}/segments/{segment_index}/artboard-{int(time.time() * 1000)}-{safe_name}"


def _guess_audio_content_type(filename: str) -> str:
    lower = filename.lower()
    if lower.endswith(".webm"):
        return "audio/webm"
    if lower.endswith(".wav"):
        return "audio/wav"
    if lower.endswith(".m4a"):
        return "audio/mp4"
    if lower.endswith(".ogg"):
        return "audio/ogg"
    guessed, _ = mimetypes.guess_type(filename)
    if guessed and guessed.startswith("audio/"):
        return guessed
    return "audio/mpeg"


async def create_presigned_upload(
    *,
    key: str,
    content_type: str,
    expires_in: int = 600,
) -> str:
    cfg = _resolve_cos_config()
    client = _get_client()

    def _sign() -> str:
        return client.get_presigned_url(
            Method="PUT",
            Bucket=cfg["bucket"],
            Key=key,
            Expired=expires_in,
            Headers={"Content-Type": content_type},
        )

    return await asyncio.to_thread(_sign)


async def object_exists(key: str) -> bool:
    cfg = _resolve_cos_config()
    client = _get_client()

    def _head() -> bool:
        try:
            client.head_object(Bucket=cfg["bucket"], Key=key)
            return True
        except Exception:
            return False

    return await asyncio.to_thread(_head)


async def create_persona_upload_credentials(
    persona_id: int,
    filename: str,
    *,
    content_type: str | None = None,
    expires_in: int = 600,
) -> dict[str, str | int]:
    guessed_type = content_type or _guess_content_type(filename)
    key = build_persona_image_key(persona_id, filename)
    upload_url = await create_presigned_upload(
        key=key,
        content_type=guessed_type,
        expires_in=expires_in,
    )
    return {
        "key": key,
        "upload_url": upload_url,
        "public_url": public_url(key),
        "content_type": guessed_type,
        "expires_in": expires_in,
    }


async def create_script_artboard_upload_credentials(
    script_id: int,
    segment_index: int,
    filename: str,
    *,
    content_type: str | None = None,
    expires_in: int = 600,
) -> dict[str, str | int]:
    guessed_type = content_type or _guess_content_type(filename)
    key = build_script_artboard_key(script_id, segment_index, filename)
    upload_url = await create_presigned_upload(
        key=key,
        content_type=guessed_type,
        expires_in=expires_in,
    )
    return {
        "key": key,
        "upload_url": upload_url,
        "public_url": public_url(key),
        "content_type": guessed_type,
        "expires_in": expires_in,
    }


async def create_persona_voice_upload_credentials(
    persona_id: int,
    filename: str,
    *,
    content_type: str | None = None,
    expires_in: int = 600,
) -> dict[str, str | int]:
    guessed_type = content_type or _guess_audio_content_type(filename)
    key = build_persona_voice_key(persona_id, filename)
    upload_url = await create_presigned_upload(
        key=key,
        content_type=guessed_type,
        expires_in=expires_in,
    )
    return {
        "key": key,
        "upload_url": upload_url,
        "public_url": public_url(key),
        "content_type": guessed_type,
        "expires_in": expires_in,
    }


async def upload_audio_bytes(data: bytes, *, key: str, content_type: str = "audio/mpeg") -> dict[str, str]:
    cfg = _resolve_cos_config()
    client = _get_client()

    def _upload() -> None:
        client.put_object(
            Bucket=cfg["bucket"],
            Body=data,
            Key=key,
            ContentType=content_type,
        )

    await asyncio.to_thread(_upload)
    return {"key": key, "url": public_url(key)}


async def upload_reference_image(persona_id: int, file_bytes: bytes, filename: str) -> dict[str, str]:
    cfg = _resolve_cos_config()
    key = build_persona_image_key(persona_id, filename)
    client = _get_client()
    content_type = _guess_content_type(filename)

    def _upload() -> None:
        client.put_object(
            Bucket=cfg["bucket"],
            Body=file_bytes,
            Key=key,
            ContentType=content_type,
        )

    await asyncio.to_thread(_upload)
    return {"key": key, "url": public_url(key)}


async def upload_video_bytes(data: bytes, *, key: str) -> dict[str, str]:
    cfg = _resolve_cos_config()
    client = _get_client()

    def _upload() -> None:
        client.put_object(
            Bucket=cfg["bucket"],
            Body=data,
            Key=key,
            ContentType="video/mp4",
        )

    await asyncio.to_thread(_upload)
    return {"key": key, "url": public_url(key)}


async def upload_image_bytes(data: bytes, *, key: str, content_type: str = "image/jpeg") -> dict[str, str]:
    cfg = _resolve_cos_config()
    client = _get_client()

    def _upload() -> None:
        client.put_object(
            Bucket=cfg["bucket"],
            Body=data,
            Key=key,
            ContentType=content_type,
        )

    await asyncio.to_thread(_upload)
    return {"key": key, "url": public_url(key)}


async def get_signed_url(key: str, expires_in: int = 3600) -> str:
    cfg = _resolve_cos_config()
    client = _get_client()

    def _sign() -> str:
        return client.get_presigned_url(
            Method="GET",
            Bucket=cfg["bucket"],
            Key=key,
            Expired=expires_in,
        )

    return await asyncio.to_thread(_sign)


async def delete_file(key: str) -> None:
    cfg = _resolve_cos_config()
    client = _get_client()

    def _delete() -> None:
        client.delete_object(Bucket=cfg["bucket"], Key=key)

    await asyncio.to_thread(_delete)
