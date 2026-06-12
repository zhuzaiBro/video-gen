"""Persona voice tone presets for Kling video generation prompts."""

from __future__ import annotations

import re

KLING_PROMPT_MAX_LEN = 2500

VOICE_TONE_PRESETS: dict[str, dict[str, str]] = {
    "warm_female": {
        "label": "温柔女声",
        "prompt": "温柔亲切的女声，语速适中，咬字清晰，适合知识分享与情感表达",
    },
    "bright_female": {
        "label": "活泼女声",
        "prompt": "年轻活泼的女声，语气轻快有感染力，适合种草、日常 vlog",
    },
    "professional_female": {
        "label": "专业女声",
        "prompt": "成熟专业的女声，沉稳自信，适合商业讲解、课程口播",
    },
    "magnetic_male": {
        "label": "磁性男声",
        "prompt": "低沉磁性的男声，富有质感，适合品牌叙事、深度内容",
    },
    "steady_male": {
        "label": "沉稳男声",
        "prompt": "沉稳可靠的男声，语速平稳，适合财经、科技、解说类内容",
    },
    "energetic_male": {
        "label": "活力男声",
        "prompt": "充满能量的男声，节奏感强，适合促销、活动、短视频口播",
    },
    "news_anchor": {
        "label": "新闻播报",
        "prompt": "标准新闻播报音色，字正腔圆，庄重清晰，信息传达准确",
    },
    "douyin_host": {
        "label": "抖音口播",
        "prompt": "抖音风格口播音色，自然接地气，停顿与重音有节奏，适合短视频带货与解说",
    },
    "custom_sample": {
        "label": "自定义样本",
        "prompt": "",
    },
}


def voice_tone_label(tone_id: str | None) -> str | None:
    if not tone_id:
        return None
    preset = VOICE_TONE_PRESETS.get(tone_id)
    return preset["label"] if preset else None


def resolve_voice_description(
    voice_tone: str | None,
    voice_style: str | None,
    *,
    voice_sample_description: str | None = None,
) -> str:
    parts: list[str] = []
    if voice_sample_description and voice_sample_description.strip():
        parts.append(f"口播音色参考样本：{voice_sample_description.strip()}")
    elif voice_tone and voice_tone in VOICE_TONE_PRESETS and voice_tone != "custom_sample":
        parts.append(VOICE_TONE_PRESETS[voice_tone]["prompt"])
    extra = (voice_style or "").strip()
    if extra:
        parts.append(extra)
    return "；".join(parts)


def truncate_kling_prompt(prompt: str, max_len: int = KLING_PROMPT_MAX_LEN) -> str:
    if len(prompt) <= max_len:
        return prompt
    return prompt[: max_len - 3] + "..."


def apply_kling_voice_to_prompt(
    prompt: str,
    *,
    persona_name: str,
    voice_sample_description: str | None = None,
) -> str:
    """Inject <<1>> markup so Kling applies voice_list[0] during native audio generation."""
    spoken: str | None = None
    match = re.search(r"口播[：:]\s*(.+?)(?:\n|$)", prompt, re.DOTALL)
    if match:
        spoken = match.group(1).strip()
    if spoken:
        if len(spoken) > 200:
            spoken = spoken[:197] + "..."
        voice_line = f'{persona_name}<<1>>说："{spoken}"'
    else:
        voice_line = f"{persona_name}<<1>>用上传的自定义音色进行自然口播"
    if voice_sample_description and voice_sample_description.strip():
        voice_line += f"（{voice_sample_description.strip()[:120]}）"
    return truncate_kling_prompt(f"{voice_line}\n\n{prompt}")
