from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


def to_camel(string: str) -> str:
    parts = string.split("_")
    return parts[0] + "".join(word.capitalize() for word in parts[1:])


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        ser_json_by_alias=True,
    )


class UserOut(CamelModel):
    id: int
    supabase_id: str
    name: str | None = None
    email: str | None = None
    login_method: str | None = None
    role: str
    created_at: datetime
    updated_at: datetime
    last_signed_in: datetime


class PersonaCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1)
    description: str | None = None
    personality: str | None = None
    voice_style: str | None = Field(None, alias="voiceStyle")
    voice_tone: str | None = Field(None, alias="voiceTone")
    background_story: str | None = Field(None, alias="backgroundStory")
    self_introduction: str | None = Field(None, alias="selfIntroduction")
    douyin_profile_url: str | None = Field(None, alias="douyinProfileUrl")
    expression_tone: str | None = Field("subtle_natural", alias="expressionTone")
    expression_notes: str | None = Field(None, alias="expressionNotes")
    height_cm: int | None = Field(None, alias="heightCm", ge=100, le=250)
    weight_kg: int | None = Field(None, alias="weightKg", ge=30, le=200)


class PersonaUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str | None = None
    description: str | None = None
    personality: str | None = None
    voice_style: str | None = Field(None, alias="voiceStyle")
    voice_tone: str | None = Field(None, alias="voiceTone")
    voice_sample_description: str | None = Field(None, alias="voiceSampleDescription")
    background_story: str | None = Field(None, alias="backgroundStory")
    self_introduction: str | None = Field(None, alias="selfIntroduction")
    douyin_profile_url: str | None = Field(None, alias="douyinProfileUrl")
    expression_tone: str | None = Field(None, alias="expressionTone")
    expression_notes: str | None = Field(None, alias="expressionNotes")
    height_cm: int | None = Field(None, alias="heightCm", ge=100, le=250)
    weight_kg: int | None = Field(None, alias="weightKg", ge=30, le=200)


class PersonaOut(CamelModel):
    id: int
    user_id: int
    name: str
    description: str | None = None
    personality: str | None = None
    voice_style: str | None = None
    voice_tone: str | None = None
    voice_sample_key: str | None = None
    voice_sample_url: str | None = None
    voice_sample_description: str | None = None
    voice_sample_kling_id: str | None = None
    background_story: str | None = None
    self_introduction: str | None = None
    douyin_profile_url: str | None = None
    expression_tone: str | None = None
    expression_notes: str | None = None
    height_cm: int | None = None
    weight_kg: int | None = None
    reference_image_key: str | None = None
    reference_image_url: str | None = None
    created_at: datetime
    updated_at: datetime


class ReferenceImageOut(CamelModel):
    id: int
    persona_id: int
    image_key: str
    image_url: str
    shot_type: str = "other"
    expression: str = "neutral"
    face_crop_key: str | None = None
    face_crop_url: str | None = None
    body_crop_key: str | None = None
    body_crop_url: str | None = None
    uploaded_at: datetime


class ReferenceImageUpdateIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    shot_type: str | None = Field(None, alias="shotType")
    expression: str | None = None


class PersonaDetailOut(PersonaOut):
    reference_images: list[ReferenceImageOut] = []


class PersonaImagePresignIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    filename: str = Field(min_length=1)
    content_type: str | None = Field(None, alias="contentType")


class PersonaImagePresignOut(CamelModel):
    key: str
    upload_url: str
    public_url: str
    content_type: str
    expires_in: int


class PersonaImageConfirmIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    key: str = Field(min_length=1)
    shot_type: str | None = Field("other", alias="shotType")
    expression: str | None = "neutral"


class PersonaVoiceSampleOut(CamelModel):
    key: str
    url: str
    description: str | None = None
    kling_voice_id: str | None = None
    kling_voice_error: str | None = None


class GenerateFromPromptIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    prompt: str = Field(min_length=10)
    duration: int | None = None
    resolution: str | None = "720p"
    aspect_ratio: str | None = Field("16:9", alias="aspectRatio")
    sound: bool = True


class GenerateFromReferenceImagesIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    prompt: str = Field(min_length=10)
    reference_image_urls: list[str] = Field(min_length=1, max_length=3, alias="referenceImageUrls")
    duration: int | None = None
    resolution: str | None = "720p"
    aspect_ratio: str | None = Field("16:9", alias="aspectRatio")
    sound: bool = True


class GenerateFromPersonaIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    persona_id: int = Field(alias="personaId")
    user_prompt: str | None = Field(None, alias="userPrompt")
    duration: int | None = None
    resolution: str | None = "720p"
    aspect_ratio: str | None = Field("16:9", alias="aspectRatio")
    sound: bool = True


class VideoTaskOut(CamelModel):
    id: int
    user_id: int
    persona_id: int | None = None
    mode: str
    prompt: str
    expanded_prompt: str | None = None
    reference_image_keys: Any | None = None
    video_params: dict | None = None
    status: str
    gemini_operation_name: str | None = None
    generated_video_key: str | None = None
    generated_video_url: str | None = None
    error_message: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    updated_at: datetime


class GeneratedVideoOut(CamelModel):
    id: int
    task_id: int
    user_id: int
    video_key: str
    video_url: str
    duration: int | None = None
    resolution: str | None = None
    aspect_ratio: str | None = None
    file_size: int | None = None
    title: str | None = None
    description: str | None = None
    is_favorite: bool
    created_at: datetime
    updated_at: datetime


class VideoMetadataUpdate(BaseModel):
    title: str | None = None
    description: str | None = None


class SuccessOut(BaseModel):
    success: bool = True


class DownloadUrlOut(BaseModel):
    url: str


class KlingSettingsOut(CamelModel):
    access_key: str = ""
    has_secret_key: bool = False
    secret_key_masked: str | None = None
    api_base_url: str = "https://api-beijing.klingai.com"
    model_name: str = "kling-v3"
    default_mode: str = "std"
    configured: bool = False
    configured_via: str = "none"


class KlingSettingsUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    access_key: str | None = Field(None, alias="accessKey")
    secret_key: str | None = Field(None, alias="secretKey")
    api_base_url: str | None = Field(None, alias="apiBaseUrl")
    model_name: str | None = Field(None, alias="modelName")
    default_mode: str | None = Field(None, alias="defaultMode")


class VideoScriptAnalyzeIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    source_url: str = Field(min_length=8, alias="sourceUrl")
    persona_id: int | None = Field(None, alias="personaId")


class TechTopicSourceOut(CamelModel):
    title: str = ""
    url: str = ""
    snippet: str = ""


class TechTopicOut(CamelModel):
    id: str
    title: str
    summary: str = ""
    heat: str = "中"
    keywords: list[str] = []
    angles: list[str] = []
    sources: list[TechTopicSourceOut] = []


class TechTopicSearchIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    query: str | None = None
    limit: int = Field(8, ge=4, le=12)


class TechTopicSearchOut(CamelModel):
    search_record_id: int | None = None
    topics: list[TechTopicOut]


class TechTopicSearchRecordOut(CamelModel):
    id: int
    query: str | None = None
    topic_count: int = 0
    topics: list[TechTopicOut] = []
    created_at: datetime


class TechScriptFromTopicIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    topic: dict
    persona_id: int | None = Field(None, alias="personaId")
    target_duration_sec: int = Field(90, ge=45, le=180, alias="targetDurationSec")
    extra_query: str | None = Field(None, alias="extraQuery")


class VideoScriptUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str | None = None
    summary: str | None = None
    raw_transcript: str | None = Field(None, alias="rawTranscript")
    decomposed_script: Any | None = Field(None, alias="decomposedScript")
    assembly_order: list[int] | None = Field(None, alias="assemblyOrder")
    continuity_enabled: bool | None = Field(None, alias="continuityEnabled")
    persona_id: int | None = Field(None, alias="personaId")


class ScriptAssembleIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    segment_order: list[int] | None = Field(None, alias="segmentOrder")


class ScriptGenerateVideoIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    persona_id: int = Field(alias="personaId")
    duration: int | None = 5
    resolution: str | None = "720p"
    aspect_ratio: str | None = Field("16:9", alias="aspectRatio")
    sound: bool = True


class ScriptGenerateVideoEstimateOut(CamelModel):
    duration: int
    resolution: str
    sound: bool
    min_minutes: int
    max_minutes: int
    message: str


class ScriptSegmentOut(CamelModel):
    index: int
    start_sec: float
    end_sec: float
    spoken_text: str | None = None
    visual_description: str | None = None
    purpose: str | None = None
    kling_duration_sec: int
    natural_duration_sec: float | None = None
    task_id: int | None = None
    task_status: str | None = None
    video_url: str | None = None
    user_prompt: str | None = None
    expanded_prompt: str | None = None
    reference_image_urls: list[str] | None = None
    generation_params: dict | None = None
    continuity_from_segment: int | None = None
    continuity_frame_url: str | None = None
    artboard_layers: list[dict] | None = Field(None, alias="artboardLayers")
    suggested_artboard_layers: list[dict] | None = Field(None, alias="suggestedArtboardLayers")


class ScriptSegmentsOut(CamelModel):
    script_id: int
    script_duration_sec: int | None = None
    segments: list[ScriptSegmentOut]
    assembly_order: list[int] = []
    continuity_enabled: bool = True
    assembled_video_url: str | None = None
    all_segments_ready: bool = False
    max_kling_duration_sec: int = 15
    min_kling_duration_sec: int = 3
    pending_count: int = 0
    processing_count: int = 0


class ScriptSegmentGenerateIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    persona_id: int = Field(alias="personaId")
    user_prompt: str | None = Field(None, alias="userPrompt")
    resolution: str | None = "720p"
    aspect_ratio: str | None = Field("16:9", alias="aspectRatio")
    sound: bool = True
    continuity: bool = True
    duration: int | None = None
    scene_compose: bool = Field(True, alias="sceneCompose")
    force_prepare_frame: bool = Field(False, alias="forcePrepareFrame")


class ScriptSegmentPrepareFrameIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    persona_id: int = Field(alias="personaId")
    aspect_ratio: str | None = Field("16:9", alias="aspectRatio")
    force: bool = False
    apply_review_feedback: bool = Field(False, alias="applyReviewFeedback")
    review_issues: list[str] = Field(default_factory=list, alias="reviewIssues")
    review_summary: str | None = Field(None, alias="reviewSummary")
    fix_suggestions: list[str] = Field(default_factory=list, alias="fixSuggestions")


class ScriptSegmentPrepareFrameOut(CamelModel):
    frame_url: str
    frame_key: str
    review_passed: bool
    review_score: int
    review_issues: list[str] = []
    review_summary: str = ""
    review_fix_suggestions: list[str] = []
    regen_background: str = ""
    regen_compose: str = ""
    action: str = ""
    scene: str = ""


class ScriptSegmentUpdateIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    duration: int | None = None
    aspect_ratio: str | None = Field(None, alias="aspectRatio")
    artboard_layers: list[dict] | None = Field(None, alias="artboardLayers")
    excluded: bool | None = None
    first_frame_mode: str | None = Field(None, alias="firstFrameMode")
    persona_image_index: int | None = Field(None, alias="personaImageIndex")
    persona_image_indexes: list[int] | None = Field(None, alias="personaImageIndexes")
    persona_image_rotations: dict[str, int] | None = Field(None, alias="personaImageRotations")


class ScriptAssembleOut(CamelModel):
    script_id: int
    video_url: str
    key: str
    segment_count: int


class ScriptGenerateAllOut(CamelModel):
    created_count: int
    skipped_count: int
    task_ids: list[int]


class VideoScriptOut(CamelModel):
    id: int
    user_id: int
    persona_id: int | None = None
    source_url: str
    platform: str | None = None
    title: str | None = None
    raw_transcript: str | None = None
    decomposed_script: Any | None = None
    summary: str | None = None
    status: str
    error_message: str | None = None
    extra_metadata: dict | None = Field(default=None, serialization_alias="metadata")
    continuity_enabled: bool = True
    script_duration_sec: int | None = None
    recommended_duration_sec: int | None = None
    max_kling_duration_sec: int | None = None
    created_at: datetime
    updated_at: datetime
