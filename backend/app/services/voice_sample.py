"""Analyze uploaded persona voice samples for video generation prompts."""

from __future__ import annotations

import asyncio
import base64
import os
import shutil
import subprocess
import tempfile
from typing import Any
from urllib.parse import urlparse

import httpx

from app.config import settings
from app.services.cos import build_persona_voice_key, upload_audio_bytes
from app.services.qwen import DASHSCOPE_DEFAULT_BASE, QwenError, _extract_json, _require_api_key

MAX_AUDIO_BYTES = 10 * 1024 * 1024
KLING_VOICE_SUFFIXES = (".mp3", ".wav", ".mp4", ".mov")
MIN_KLING_VOICE_SEC = 5.0
MAX_KLING_VOICE_SEC = 30.0

VOICE_ANALYSIS_PROMPT = """你是一位配音导演。请分析这段人声音频，用于 AI 视频口播音色描述。

严格输出 JSON（不要 markdown），字段：
{
  "description": "50-120字中文，描述音调、语速、情感、气质与适用场景，可直接写入视频生成提示词",
  "transcript": "尽量完整的口播转写，若听不清可留空字符串"
}"""


class VoiceSampleError(Exception):
    pass


def _guess_audio_mime(filename: str, content_type: str) -> str:
    if content_type.startswith("audio/"):
        return content_type.split(";")[0]
    lower = filename.lower()
    if lower.endswith(".webm"):
        return "audio/webm"
    if lower.endswith(".wav"):
        return "audio/wav"
    if lower.endswith(".m4a"):
        return "audio/mp4"
    if lower.endswith(".ogg"):
        return "audio/ogg"
    return "audio/mpeg"


async def download_audio(url: str) -> tuple[bytes, str]:
    headers = {"User-Agent": "Mozilla/5.0 (compatible; VideoGenVoiceBot/1.0)"}
    async with httpx.AsyncClient(follow_redirects=True, timeout=120.0) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        data = response.content
    if len(data) > MAX_AUDIO_BYTES:
        raise VoiceSampleError(f"音频超过 {MAX_AUDIO_BYTES // (1024 * 1024)}MB 限制")
    if len(data) < 512:
        raise VoiceSampleError("音频文件过小")
    content_type = response.headers.get("content-type", "audio/mpeg")
    return data, _guess_audio_mime(url, content_type)


async def _call_qwen_audio_data(data_url: str) -> dict[str, Any]:
    api_key = _require_api_key()
    model = settings.qwen_audio_model or "qwen-audio-turbo"
    base_url = (settings.dashscope_base_url or DASHSCOPE_DEFAULT_BASE).rstrip("/")
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "input_audio", "input_audio": {"data": data_url}},
                    {"type": "text", "text": VOICE_ANALYSIS_PROMPT},
                ],
            }
        ],
        "temperature": 0.2,
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
        )
    if response.status_code >= 400:
        detail = response.text.strip() or response.reason_phrase
        raise QwenError(f"通义千问音频 API 错误 ({response.status_code}): {detail}")

    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise QwenError("通义千问未返回音色分析结果")
    text = (choices[0].get("message") or {}).get("content", "")
    if not text.strip():
        raise QwenError("通义千问返回空内容")
    try:
        return _extract_json(text)
    except QwenError:
        return {"description": text.strip()[:200], "transcript": ""}


async def analyze_voice_sample_bytes(audio_bytes: bytes, mime_type: str) -> str:
    encoded = base64.b64encode(audio_bytes).decode("ascii")
    data_url = f"data:{mime_type};base64,{encoded}"
    try:
        result = await _call_qwen_audio_data(data_url)
    except QwenError:
        result = {"description": fallback_voice_description(), "transcript": ""}
    description = (result.get("description") or "").strip()
    if not description:
        raise VoiceSampleError("未能从音频提取音色描述")
    return description


async def analyze_voice_sample_url(audio_url: str) -> str:
    try:
        audio_bytes, mime_type = await download_audio(audio_url)
        return await analyze_voice_sample_bytes(audio_bytes, mime_type)
    except VoiceSampleError:
        raise
    except Exception as exc:
        raise VoiceSampleError(str(exc)) from exc


def fallback_voice_description() -> str:
    return "用户自定义音色样本：自然口播，语速适中，语气亲切真实，生成时请尽量贴近样本音色"


def _path_suffix(path: str) -> str:
    clean = path.lower().split("?")[0]
    for ext in (".webm", ".m4a", ".ogg", ".mp3", ".wav", ".mp4", ".mov"):
        if clean.endswith(ext):
            return ext
    return ".bin"


def is_kling_compatible_voice(path_or_url: str) -> bool:
    return _path_suffix(path_or_url) in KLING_VOICE_SUFFIXES


def _suffix_from_mime(mime_type: str) -> str:
    mime = mime_type.split(";")[0].strip().lower()
    mapping = {
        "audio/webm": ".webm",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/mp4": ".m4a",
        "audio/ogg": ".ogg",
        "video/mp4": ".mp4",
        "video/quicktime": ".mov",
    }
    return mapping.get(mime, ".bin")


def _run_ffmpeg(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, capture_output=True, text=True)


def _probe_duration_sec(file_path: str) -> float:
    if shutil.which("ffprobe") is None:
        raise VoiceSampleError("服务器未安装 ffprobe/ffmpeg，无法检测音频时长")
    result = _run_ffmpeg(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "csv=p=0",
            file_path,
        ]
    )
    if result.returncode != 0:
        raise VoiceSampleError("无法读取音频时长")
    try:
        return float(result.stdout.strip())
    except ValueError as exc:
        raise VoiceSampleError("无法读取音频时长") from exc


def _convert_audio_file_to_wav(input_path: str, output_path: str) -> None:
    if shutil.which("ffmpeg") is None:
        raise VoiceSampleError("服务器未安装 ffmpeg，无法将录音转换为可灵支持的 wav 格式")
    result = _run_ffmpeg(
        [
            "ffmpeg",
            "-y",
            "-i",
            input_path,
            "-t",
            str(int(MAX_KLING_VOICE_SEC)),
            "-ar",
            "44100",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            output_path,
        ]
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "ffmpeg 转换失败").strip()
        raise VoiceSampleError(detail[:300])


async def convert_audio_bytes_to_wav(audio_bytes: bytes, *, input_suffix: str) -> bytes:
    def _convert() -> bytes:
        with tempfile.TemporaryDirectory() as tmp:
            input_path = os.path.join(tmp, f"input{input_suffix}")
            output_path = os.path.join(tmp, "output.wav")
            with open(input_path, "wb") as handle:
                handle.write(audio_bytes)
            _convert_audio_file_to_wav(input_path, output_path)
            duration = _probe_duration_sec(output_path)
            if duration < MIN_KLING_VOICE_SEC:
                raise VoiceSampleError(
                    f"音频时长约 {duration:.1f} 秒，可灵要求 5–30 秒纯净人声，请重新录制"
                )
            with open(output_path, "rb") as handle:
                return handle.read()

    return await asyncio.to_thread(_convert)


async def ensure_kling_compatible_voice(
    *,
    persona_id: int,
    sample_url: str,
    sample_key: str,
) -> tuple[str, str, bool]:
    """Return (url, key, converted) for Kling custom-voice registration."""
    if is_kling_compatible_voice(sample_url) or is_kling_compatible_voice(sample_key):
        return sample_url, sample_key, False

    audio_bytes, mime_type = await download_audio(sample_url)
    suffix = _path_suffix(urlparse(sample_url).path) or _suffix_from_mime(mime_type)
    wav_bytes = await convert_audio_bytes_to_wav(audio_bytes, input_suffix=suffix)
    new_key = build_persona_voice_key(persona_id, "kling-voice.wav")
    uploaded = await upload_audio_bytes(wav_bytes, key=new_key, content_type="audio/wav")
    return uploaded["url"], uploaded["key"], True
