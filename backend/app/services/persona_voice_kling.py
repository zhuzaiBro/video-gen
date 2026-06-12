"""Register persona voice samples with Kling custom-voice API."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Persona
from app.services.cos import delete_file
from app.services.kling import KlingApiError, KlingRuntimeConfig, register_custom_voice
from app.services.voice_sample import VoiceSampleError, ensure_kling_compatible_voice
from app.utils import utc_now


async def ensure_persona_kling_voice(
    persona: Persona,
    runtime: KlingRuntimeConfig,
    *,
    db: AsyncSession | None = None,
) -> str | None:
    """Return Kling voice_id, registering from voice_sample_url when missing."""
    if persona.voice_sample_kling_id:
        return persona.voice_sample_kling_id
    if not persona.voice_sample_url or not persona.voice_sample_key:
        return None
    try:
        runtime.require_credentials()
    except KlingApiError:
        return None

    voice_url = persona.voice_sample_url
    voice_key = persona.voice_sample_key
    try:
        voice_url, voice_key, converted = await ensure_kling_compatible_voice(
            persona_id=persona.id,
            sample_url=voice_url,
            sample_key=voice_key,
        )
        if converted and voice_key != persona.voice_sample_key:
            old_key = persona.voice_sample_key
            persona.voice_sample_key = voice_key
            persona.voice_sample_url = voice_url
            if db is not None:
                await db.commit()
            if old_key and old_key != voice_key:
                try:
                    await delete_file(old_key)
                except Exception:
                    pass
    except VoiceSampleError:
        return None

    try:
        voice_id = await register_custom_voice(
            runtime,
            voice_name=persona.name,
            voice_url=voice_url,
        )
    except KlingApiError:
        return None
    persona.voice_sample_kling_id = voice_id
    persona.updated_at = utc_now()
    if db is not None:
        await db.commit()
        await db.refresh(persona)
    return voice_id
