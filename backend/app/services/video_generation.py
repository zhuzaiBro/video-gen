from app.services.kling import KlingRuntimeConfig, create_image2video_task, create_multi_image2video_task, create_text2video_task
from app.services.kling_image import resolve_kling_image
from app.services.persona_photos import reference_image_expression_hint, resolve_expression_prompt
from app.services.voice_tone import apply_kling_voice_to_prompt, resolve_voice_description


async def _resolve_reference_images(
    reference_image_urls: list[str],
    reference_image_keys: list[str | None] | None = None,
) -> list[str]:
    keys = reference_image_keys or [None] * len(reference_image_urls)
    if len(keys) != len(reference_image_urls):
        keys = [None] * len(reference_image_urls)
    return [
        await resolve_kling_image(url, cos_key=key)
        for url, key in zip(reference_image_urls, keys)
    ]


async def generate_video(
    config: KlingRuntimeConfig,
    *,
    prompt: str,
    reference_image_urls: list[str] | None = None,
    reference_image_keys: list[str | None] | None = None,
    duration: int | None = None,
    resolution: str | None = None,
    aspect_ratio: str | None = None,
    enable_sound: bool = True,
    voice_kling_id: str | None = None,
) -> dict[str, str]:
    voice_ids = [voice_kling_id] if voice_kling_id else None
    if reference_image_urls:
        images = await _resolve_reference_images(reference_image_urls, reference_image_keys)
        if len(images) == 1:
            result = await create_image2video_task(
                config,
                prompt=prompt,
                image=images[0],
                duration=duration,
                resolution=resolution,
                aspect_ratio=aspect_ratio,
                enable_sound=enable_sound,
                voice_ids=voice_ids,
            )
        else:
            result = await create_multi_image2video_task(
                config,
                prompt=prompt,
                image_list=images,
                duration=duration,
                resolution=resolution,
                aspect_ratio=aspect_ratio,
                enable_sound=enable_sound,
                voice_ids=voice_ids,
            )
    else:
        result = await create_text2video_task(
            config,
            prompt=prompt,
            duration=duration,
            resolution=resolution,
            aspect_ratio=aspect_ratio,
            enable_sound=enable_sound,
            voice_ids=voice_ids,
        )
    return {"operation_name": result["task_id"], "task_type": result["task_type"]}


def expand_persona_to_prompt(
    *,
    persona_name: str,
    persona_description: str,
    personality_traits: str,
    voice_style: str,
    voice_tone: str | None = None,
    voice_sample_description: str | None = None,
    background_story: str = "",
    self_introduction: str = "",
    douyin_profile_url: str = "",
    user_prompt: str | None = None,
    expression_tone: str | None = None,
    expression_notes: str | None = None,
    reference_expression_hint: str | None = None,
    protagonist_reference_hint: str | None = None,
    body_profile_hint: str | None = None,
    pose_orientation_hint: str | None = None,
    face_identity_hint: str | None = None,
) -> str:
    voice_desc = resolve_voice_description(
        voice_tone, voice_style, voice_sample_description=voice_sample_description
    )
    expression_desc = resolve_expression_prompt(expression_tone, expression_notes=expression_notes)
    parts = [
        f"A cinematic video featuring {persona_name}.",
        self_introduction and f"Self introduction: {self_introduction}.",
        persona_description,
        personality_traits and f"Personality: {personality_traits}.",
        body_profile_hint,
        pose_orientation_hint,
        face_identity_hint,
        expression_desc,
        reference_expression_hint,
        protagonist_reference_hint,
        voice_desc and f"Voice and speech tone: {voice_desc}.",
        background_story and f"Background: {background_story}.",
        douyin_profile_url and f"Social profile reference: {douyin_profile_url}.",
        user_prompt and (
            f"Direction: The on-screen presenter MUST be {persona_name} matching reference images; "
            f"ignore conflicting gender or appearance in the script. {user_prompt}"
        ),
        "Body language: small natural gestures only; avoid large arm swings or exaggerated acting.",
        "Natural motion, cinematic lighting, shallow depth of field, high detail.",
    ]
    return " ".join(p for p in parts if p)


async def generate_video_from_persona(
    config: KlingRuntimeConfig,
    *,
    persona_name: str,
    persona_description: str,
    personality_traits: str,
    voice_style: str,
    voice_tone: str | None = None,
    voice_sample_description: str | None = None,
    voice_kling_id: str | None = None,
    background_story: str = "",
    self_introduction: str = "",
    douyin_profile_url: str = "",
    reference_image_urls: list[str] | None = None,
    reference_image_keys: list[str | None] | None = None,
    user_prompt: str | None = None,
    duration: int | None = None,
    resolution: str | None = None,
    aspect_ratio: str | None = None,
    enable_sound: bool = True,
    continuity_mode: bool = False,
    artboard_locked: bool = False,
    prepared_first_frame_mode: bool = False,
    expression_tone: str | None = None,
    expression_notes: str | None = None,
    reference_expression_hint: str | None = None,
    protagonist_reference_hint: str | None = None,
    body_profile_hint: str | None = None,
    pose_orientation_hint: str | None = None,
    face_identity_hint: str | None = None,
) -> dict[str, str]:
    expression_desc = resolve_expression_prompt(expression_tone, expression_notes=expression_notes)
    protagonist_hint = protagonist_reference_hint
    if continuity_mode:
        voice_desc = resolve_voice_description(
            voice_tone, voice_style, voice_sample_description=voice_sample_description
        )
        expanded_prompt = " ".join(
            p
            for p in [
                f"Seamlessly continue the video from the provided first frame featuring {persona_name}.",
                "The opening frame must match the reference image exactly — same scene, lighting, camera angle, and character position.",
                "No scene cut, no jump cut, no fade; only natural forward motion from that exact frame.",
                user_prompt,
                body_profile_hint,
                pose_orientation_hint,
                face_identity_hint,
                expression_desc,
                reference_expression_hint,
                protagonist_hint,
                voice_desc and f"Voice and speech tone: {voice_desc}.",
                user_prompt
                and "The on-screen presenter MUST match the persona and reference images; "
                "ignore conflicting gender or appearance in the script direction.",
                "Body language: small natural gestures only; avoid exaggerated acting.",
                "Subtle cinematic motion, maintain visual continuity throughout.",
                artboard_locked
                and "Do not render any on-screen stickers, badges, captions, promotional labels, floating UI, or text overlays. Clean footage only.",
            ]
            if p
        )
    elif prepared_first_frame_mode:
        voice_desc = resolve_voice_description(
            voice_tone, voice_style, voice_sample_description=voice_sample_description
        )
        expanded_prompt = " ".join(
            p
            for p in [
                f"Generate video starting exactly from the provided first frame featuring {persona_name}.",
                "The opening frame MUST match the reference image exactly — same person, scene, lighting, camera angle, and composition.",
                "Do not restore the persona photo's original background; keep the script scene from the reference frame.",
                "Only subtle natural motion forward from this frame; no scene cut, no jump cut, no fade.",
                user_prompt,
                body_profile_hint,
                pose_orientation_hint,
                face_identity_hint,
                expression_desc,
                reference_expression_hint,
                protagonist_hint,
                voice_desc and f"Voice and speech tone: {voice_desc}.",
                "The on-screen presenter MUST match the persona and reference first frame.",
                "Body language: small natural gestures only; avoid exaggerated acting.",
                artboard_locked
                and "Do not render any on-screen stickers, badges, captions, promotional labels, floating UI, or text overlays. Clean footage only.",
            ]
            if p
        )
    else:
        expanded_prompt = expand_persona_to_prompt(
            persona_name=persona_name,
            persona_description=persona_description,
            personality_traits=personality_traits,
            voice_style=voice_style,
            voice_tone=voice_tone,
            voice_sample_description=voice_sample_description,
            background_story=background_story,
            self_introduction=self_introduction,
            douyin_profile_url=douyin_profile_url,
            user_prompt=user_prompt,
            expression_tone=expression_tone,
            expression_notes=expression_notes,
            reference_expression_hint=reference_expression_hint,
            protagonist_reference_hint=protagonist_reference_hint,
            body_profile_hint=body_profile_hint,
            pose_orientation_hint=pose_orientation_hint,
            face_identity_hint=face_identity_hint,
        )
        if artboard_locked:
            expanded_prompt = (
                f"{expanded_prompt} "
                "Do not render any on-screen stickers, badges, captions, promotional labels, floating UI, or text overlays. Clean footage only."
            )
    use_kling_voice = bool(voice_kling_id and enable_sound)
    if use_kling_voice:
        expanded_prompt = apply_kling_voice_to_prompt(
            expanded_prompt,
            persona_name=persona_name,
            voice_sample_description=voice_sample_description,
        )
        enable_sound = True
    result = await generate_video(
        config,
        prompt=expanded_prompt,
        reference_image_urls=reference_image_urls,
        reference_image_keys=reference_image_keys,
        duration=duration,
        resolution=resolution,
        aspect_ratio=aspect_ratio,
        enable_sound=enable_sound,
        voice_kling_id=voice_kling_id if use_kling_voice else None,
    )
    return {
        "operation_name": result["operation_name"],
        "task_type": result["task_type"],
        "expanded_prompt": expanded_prompt,
    }
