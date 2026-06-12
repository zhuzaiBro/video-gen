import asyncio
import time
from dataclasses import dataclass
from typing import Any, Literal

import httpx
import jwt

from app.services.kling_config import LEGACY_KLING_API_BASE_URL, normalize_api_base_url

KlingTaskType = Literal["text2video", "image2video", "multi-image2video"]
KlingTaskStatus = Literal["submitted", "processing", "succeed", "failed"]


class KlingApiError(Exception):
    def __init__(self, message: str, *, code: int | None = None) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class KlingRuntimeConfig:
    access_key: str
    secret_key: str
    api_base_url: str
    model_name: str
    default_mode: str

    @classmethod
    def from_kling_config(cls, config) -> "KlingRuntimeConfig":
        return cls(
            access_key=config.access_key,
            secret_key=config.secret_key,
            api_base_url=normalize_api_base_url(config.api_base_url),
            model_name=config.model_name,
            default_mode=config.default_mode or "std",
        )

    def require_credentials(self) -> None:
        if not self.access_key or not self.secret_key:
            raise KlingApiError(
                "可灵 API 未配置，请在生成工作室面板填写 Access Key / Secret Key"
            )

    def make_token(self) -> str:
        self.require_credentials()
        now = int(time.time())
        payload = {
            "iss": self.access_key,
            "exp": now + 1800,
            "nbf": now - 5,
        }
        return jwt.encode(
            payload,
            self.secret_key,
            algorithm="HS256",
            headers={"alg": "HS256", "typ": "JWT"},
        )

    def headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.make_token()}",
            "Content-Type": "application/json",
        }

    def max_duration_seconds(self) -> int:
        if self.model_name.startswith("kling-v3"):
            return 15
        return 10

    def normalize_duration(self, duration: int | None) -> str:
        max_d = self.max_duration_seconds()
        if self.model_name.startswith("kling-v3"):
            if duration is None:
                return "5"
            clamped = max(3, min(max_d, int(round(duration))))
            return str(clamped)
        if duration is None or duration <= 5:
            return "5"
        if duration > 10 and max_d >= 15:
            return "15"
        return "10"

    def normalize_mode(self, resolution: str | None) -> str:
        if resolution in {"1080p", "4K"}:
            return "pro"
        return self.default_mode or "std"

    def sound_param(self, *, enable_sound: bool = True) -> str:
        if not enable_sound:
            return "off"
        if self.model_name.startswith("kling-v3"):
            return "on"
        return "off"


def _auth_error_hint(config: KlingRuntimeConfig) -> str:
    if config.api_base_url.rstrip("/") == LEGACY_KLING_API_BASE_URL:
        return (
            "可灵 API 身份验证失败：国内账号请使用 "
            "https://api-beijing.klingai.com 作为 API 地址"
        )
    return (
        "可灵 API 身份验证失败，请检查 Access Key / Secret Key 是否正确，"
        "并确认 API 地址为 https://api-beijing.klingai.com"
    )


async def _request(
    config: KlingRuntimeConfig,
    method: str,
    path: str,
    *,
    json: dict[str, Any] | None = None,
) -> dict[str, Any]:
    url = f"{config.api_base_url}{path}"
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.request(method, url, headers=config.headers(), json=json)

    if response.status_code == 401:
        raise KlingApiError(_auth_error_hint(config), code=1000)

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        message = response.text.strip() or str(exc)
        raise KlingApiError(f"可灵 API 请求失败 ({response.status_code}): {message}") from exc

    data = response.json()
    if data.get("code", 0) != 0:
        message = data.get("message") or "Kling API error"
        if data.get("code") == 1201 and "model" in message.lower():
            message = f"{message}，请在可灵配置中将模型改为 kling-v3"
        raise KlingApiError(message, code=data.get("code"))
    return data


def _voice_list_payload(voice_ids: list[str] | None) -> list[dict[str, str]] | None:
    if not voice_ids:
        return None
    cleaned = [voice_id.strip() for voice_id in voice_ids if voice_id and voice_id.strip()]
    if not cleaned:
        return None
    return [{"voice_id": voice_id} for voice_id in cleaned[:2]]


def _append_voice_list(payload: dict[str, Any], voice_ids: list[str] | None) -> None:
    voice_list = _voice_list_payload(voice_ids)
    if voice_list:
        payload["voice_list"] = voice_list
        payload["sound"] = "on"


async def create_custom_voice_task(
    config: KlingRuntimeConfig,
    *,
    voice_name: str,
    voice_url: str,
) -> str:
    payload = {
        "voice_name": voice_name[:20],
        "voice_url": voice_url,
    }
    data = await _request(config, "POST", "/v1/general/custom-voices", json=payload)
    return data["data"]["task_id"]


async def get_custom_voice_task(config: KlingRuntimeConfig, task_id: str) -> dict[str, Any]:
    data = await _request(config, "GET", f"/v1/general/custom-voices/{task_id}")
    return data["data"]


def _extract_custom_voice_id(task_data: dict[str, Any]) -> str | None:
    voices = (task_data.get("task_result") or {}).get("voices") or []
    for voice in voices:
        voice_id = voice.get("voice_id")
        if voice_id:
            return str(voice_id)
    return None


async def register_custom_voice(
    config: KlingRuntimeConfig,
    *,
    voice_name: str,
    voice_url: str,
    max_wait_sec: int = 90,
) -> str:
    task_id = await create_custom_voice_task(
        config,
        voice_name=voice_name,
        voice_url=voice_url,
    )
    deadline = time.monotonic() + max_wait_sec
    while time.monotonic() < deadline:
        task_data = await get_custom_voice_task(config, task_id)
        status = task_data.get("task_status")
        if status == "succeed":
            voice_id = _extract_custom_voice_id(task_data)
            if voice_id:
                return voice_id
            raise KlingApiError("可灵音色注册成功但未返回 voice_id")
        if status == "failed":
            message = task_data.get("task_status_msg") or "可灵音色注册失败"
            raise KlingApiError(message)
        await asyncio.sleep(2)
    raise KlingApiError("可灵音色注册超时，请稍后重试")


async def create_text2video_task(
    config: KlingRuntimeConfig,
    *,
    prompt: str,
    duration: int | None = None,
    aspect_ratio: str | None = None,
    resolution: str | None = None,
    negative_prompt: str = "",
    enable_sound: bool = True,
    voice_ids: list[str] | None = None,
) -> dict[str, str]:
    payload = {
        "model_name": config.model_name,
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "duration": config.normalize_duration(duration),
        "aspect_ratio": aspect_ratio or "16:9",
        "mode": config.normalize_mode(resolution),
        "sound": config.sound_param(enable_sound=enable_sound),
    }
    _append_voice_list(payload, voice_ids)
    data = await _request(config, "POST", "/v1/videos/text2video", json=payload)
    task_id = data["data"]["task_id"]
    return {"task_id": task_id, "task_type": "text2video"}


async def create_image2video_task(
    config: KlingRuntimeConfig,
    *,
    prompt: str,
    image: str,
    duration: int | None = None,
    aspect_ratio: str | None = None,
    resolution: str | None = None,
    negative_prompt: str = "",
    enable_sound: bool = True,
    voice_ids: list[str] | None = None,
) -> dict[str, str]:
    payload = {
        "model_name": config.model_name,
        "prompt": prompt,
        "image": image,
        "negative_prompt": negative_prompt,
        "duration": config.normalize_duration(duration),
        "aspect_ratio": aspect_ratio or "16:9",
        "mode": config.normalize_mode(resolution),
        "sound": config.sound_param(enable_sound=enable_sound),
    }
    _append_voice_list(payload, voice_ids)
    data = await _request(config, "POST", "/v1/videos/image2video", json=payload)
    task_id = data["data"]["task_id"]
    return {"task_id": task_id, "task_type": "image2video"}


async def create_multi_image2video_task(
    config: KlingRuntimeConfig,
    *,
    prompt: str,
    image_list: list[str],
    duration: int | None = None,
    aspect_ratio: str | None = None,
    resolution: str | None = None,
    negative_prompt: str = "",
    enable_sound: bool = True,
    voice_ids: list[str] | None = None,
) -> dict[str, str]:
    payload = {
        "model_name": config.model_name,
        "prompt": prompt,
        "image_list": [{"image": url} for url in image_list],
        "negative_prompt": negative_prompt,
        "duration": config.normalize_duration(duration),
        "aspect_ratio": aspect_ratio or "16:9",
        "mode": config.normalize_mode(resolution),
        "sound": config.sound_param(enable_sound=enable_sound),
    }
    _append_voice_list(payload, voice_ids)
    data = await _request(config, "POST", "/v1/videos/multi-image2video", json=payload)
    task_id = data["data"]["task_id"]
    return {"task_id": task_id, "task_type": "multi-image2video"}


async def get_kling_task(config: KlingRuntimeConfig, task_type: KlingTaskType, task_id: str) -> dict[str, Any]:
    data = await _request(config, "GET", f"/v1/videos/{task_type}/{task_id}")
    return data["data"]


def map_kling_status(status: str) -> str:
    if status == "succeed":
        return "completed"
    if status == "failed":
        return "failed"
    if status in {"submitted", "processing"}:
        return "processing"
    return "pending"


async def sync_kling_task_result(
    config: KlingRuntimeConfig,
    task_type: KlingTaskType,
    task_id: str,
) -> dict[str, Any]:
    data = await get_kling_task(config, task_type, task_id)
    status = map_kling_status(data.get("task_status", "processing"))
    result: dict[str, Any] = {
        "status": status,
        "error_message": data.get("task_status_msg") if status == "failed" else None,
        "generated_video_url": None,
        "generated_video_key": None,
    }
    if status == "completed":
        videos = (data.get("task_result") or {}).get("videos") or []
        if videos:
            result["generated_video_url"] = videos[0].get("url")
            result["generated_video_key"] = videos[0].get("id")
    return result


async def test_kling_connection(config: KlingRuntimeConfig) -> None:
    """Verify credentials against Kling API (non-existent task id → auth OK if not 401)."""
    config.require_credentials()
    url = f"{config.api_base_url}/v1/videos/text2video/__auth_test__"
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, headers=config.headers())
    if response.status_code == 401:
        raise KlingApiError(_auth_error_hint(config), code=1000)
