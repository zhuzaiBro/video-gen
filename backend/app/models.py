from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ENUM, JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


role_enum = ENUM("user", "admin", name="role", create_type=False)
task_status_enum = ENUM(
    "pending", "processing", "completed", "failed", name="task_status", create_type=False
)
generation_mode_enum = ENUM(
    "prompt", "reference_image", "persona_agent", name="generation_mode", create_type=False
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    supabase_id: Mapped[str] = mapped_column("supabaseId", String(36), unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(String(320))
    login_method: Mapped[str | None] = mapped_column("loginMethod", String(64))
    role: Mapped[str] = mapped_column(role_enum, server_default="user")
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column("updatedAt", DateTime, server_default=func.now())
    last_signed_in: Mapped[datetime] = mapped_column("lastSignedIn", DateTime, server_default=func.now())


class KlingSettings(Base):
    __tablename__ = "kling_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column("userId", ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    access_key: Mapped[str] = mapped_column("accessKey", String(128), server_default="")
    secret_key: Mapped[str] = mapped_column("secretKey", String(256), server_default="")
    api_base_url: Mapped[str] = mapped_column("apiBaseUrl", String(512), server_default="https://api.klingai.com")
    model_name: Mapped[str] = mapped_column("modelName", String(64), server_default="kling-v2-6")
    default_mode: Mapped[str] = mapped_column("defaultMode", String(16), server_default="std")
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column("updatedAt", DateTime, server_default=func.now())


class Persona(Base):
    __tablename__ = "personas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column("userId", ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    personality: Mapped[str | None] = mapped_column(Text)
    voice_style: Mapped[str | None] = mapped_column("voiceStyle", String(255))
    voice_tone: Mapped[str | None] = mapped_column("voiceTone", String(64))
    voice_sample_key: Mapped[str | None] = mapped_column("voiceSampleKey", String(512))
    voice_sample_url: Mapped[str | None] = mapped_column("voiceSampleUrl", String(1024))
    voice_sample_description: Mapped[str | None] = mapped_column("voiceSampleDescription", Text)
    voice_sample_kling_id: Mapped[str | None] = mapped_column("voiceSampleKlingId", String(64))
    background_story: Mapped[str | None] = mapped_column("backgroundStory", Text)
    self_introduction: Mapped[str | None] = mapped_column("selfIntroduction", Text)
    douyin_profile_url: Mapped[str | None] = mapped_column("douyinProfileUrl", String(1024))
    expression_tone: Mapped[str] = mapped_column(
        "expressionTone", String(64), server_default="subtle_natural", nullable=False
    )
    expression_notes: Mapped[str | None] = mapped_column("expressionNotes", Text)
    height_cm: Mapped[int | None] = mapped_column("heightCm", Integer)
    weight_kg: Mapped[int | None] = mapped_column("weightKg", Integer)
    reference_image_key: Mapped[str | None] = mapped_column("referenceImageKey", String(512))
    reference_image_url: Mapped[str | None] = mapped_column("referenceImageUrl", String(1024))
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column("updatedAt", DateTime, server_default=func.now())

    reference_images: Mapped[list["ReferenceImage"]] = relationship(back_populates="persona")


class ReferenceImage(Base):
    __tablename__ = "reference_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    persona_id: Mapped[int] = mapped_column("personaId", ForeignKey("personas.id", ondelete="CASCADE"))
    image_key: Mapped[str] = mapped_column("imageKey", String(512))
    image_url: Mapped[str] = mapped_column("imageUrl", String(1024))
    shot_type: Mapped[str] = mapped_column("shotType", String(32), server_default="other", nullable=False)
    expression: Mapped[str] = mapped_column(String(32), server_default="neutral", nullable=False)
    face_crop_key: Mapped[str | None] = mapped_column("faceCropKey", String(512))
    face_crop_url: Mapped[str | None] = mapped_column("faceCropUrl", String(1024))
    body_crop_key: Mapped[str | None] = mapped_column("bodyCropKey", String(512))
    body_crop_url: Mapped[str | None] = mapped_column("bodyCropUrl", String(1024))
    uploaded_at: Mapped[datetime] = mapped_column("uploadedAt", DateTime, server_default=func.now())

    persona: Mapped[Persona] = relationship(back_populates="reference_images")


class VideoGenerationTask(Base):
    __tablename__ = "video_generation_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column("userId", ForeignKey("users.id", ondelete="CASCADE"))
    persona_id: Mapped[int | None] = mapped_column("personaId", ForeignKey("personas.id", ondelete="SET NULL"))
    mode: Mapped[str] = mapped_column(generation_mode_enum)
    prompt: Mapped[str] = mapped_column(Text)
    expanded_prompt: Mapped[str | None] = mapped_column("expandedPrompt", Text)
    reference_image_keys: Mapped[dict | list | None] = mapped_column("referenceImageKeys", JSON)
    video_params: Mapped[dict | None] = mapped_column("videoParams", JSON)
    status: Mapped[str] = mapped_column(task_status_enum, server_default="pending")
    gemini_operation_name: Mapped[str | None] = mapped_column("geminiOperationName", String(512))
    generated_video_key: Mapped[str | None] = mapped_column("generatedVideoKey", String(512))
    generated_video_url: Mapped[str | None] = mapped_column("generatedVideoUrl", String(1024))
    error_message: Mapped[str | None] = mapped_column("errorMessage", Text)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column("startedAt", DateTime)
    completed_at: Mapped[datetime | None] = mapped_column("completedAt", DateTime)
    updated_at: Mapped[datetime] = mapped_column("updatedAt", DateTime, server_default=func.now())


class GeneratedVideo(Base):
    __tablename__ = "generated_videos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column("taskId", ForeignKey("video_generation_tasks.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column("userId", ForeignKey("users.id", ondelete="CASCADE"))
    video_key: Mapped[str] = mapped_column("videoKey", String(512))
    video_url: Mapped[str] = mapped_column("videoUrl", String(1024))
    duration: Mapped[int | None] = mapped_column(Integer)
    resolution: Mapped[str | None] = mapped_column(String(50))
    aspect_ratio: Mapped[str | None] = mapped_column("aspectRatio", String(10))
    file_size: Mapped[int | None] = mapped_column("fileSize", Integer)
    title: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    is_favorite: Mapped[bool] = mapped_column("isFavorite", Boolean, server_default="false")
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column("updatedAt", DateTime, server_default=func.now())


class VideoScript(Base):
    __tablename__ = "video_scripts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column("userId", ForeignKey("users.id", ondelete="CASCADE"))
    persona_id: Mapped[int | None] = mapped_column("personaId", ForeignKey("personas.id", ondelete="SET NULL"))
    source_url: Mapped[str] = mapped_column("sourceUrl", String(2048))
    platform: Mapped[str | None] = mapped_column(String(32))
    title: Mapped[str | None] = mapped_column(String(512))
    raw_transcript: Mapped[str | None] = mapped_column("rawTranscript", Text)
    decomposed_script: Mapped[dict | list | None] = mapped_column("decomposedScript", JSON)
    summary: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(task_status_enum, server_default="pending")
    error_message: Mapped[str | None] = mapped_column("errorMessage", Text)
    extra_metadata: Mapped[dict | None] = mapped_column("metadata", JSON)
    continuity_enabled: Mapped[bool] = mapped_column(
        "continuityEnabled", Boolean, server_default="true", nullable=False
    )
    bottom_barrage_enabled: Mapped[bool] = mapped_column(
        "bottomBarrageEnabled", Boolean, server_default="false", nullable=False
    )
    active_assembly_id: Mapped[int | None] = mapped_column(
        "activeAssemblyId", ForeignKey("script_assemblies.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column("updatedAt", DateTime, server_default=func.now())

    segments: Mapped[list["ScriptSegment"]] = relationship(back_populates="script")
    assemblies: Mapped[list["ScriptAssembly"]] = relationship(
        back_populates="script",
        foreign_keys="ScriptAssembly.script_id",
    )
    active_assembly: Mapped["ScriptAssembly | None"] = relationship(
        foreign_keys=[active_assembly_id],
    )


class ScriptSegment(Base):
    """分镜定义（来自脚本拆解，可编辑顺序）"""

    __tablename__ = "script_segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    script_id: Mapped[int] = mapped_column("scriptId", ForeignKey("video_scripts.id", ondelete="CASCADE"))
    segment_index: Mapped[int] = mapped_column("segmentIndex", Integer)
    start_sec: Mapped[float] = mapped_column("startSec", Float, server_default="0")
    end_sec: Mapped[float] = mapped_column("endSec", Float, server_default="5")
    spoken_text: Mapped[str | None] = mapped_column("spokenText", Text)
    visual_description: Mapped[str | None] = mapped_column("visualDescription", Text)
    purpose: Mapped[str | None] = mapped_column(String(128))
    kling_duration_sec: Mapped[int] = mapped_column("klingDurationSec", Integer, server_default="5")
    assembly_order: Mapped[int] = mapped_column("assemblyOrder", Integer, server_default="0")
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column("updatedAt", DateTime, server_default=func.now())

    script: Mapped[VideoScript] = relationship(back_populates="segments")
    generations: Mapped[list["ScriptSegmentGeneration"]] = relationship(back_populates="segment")


class ScriptSegmentGeneration(Base):
    """分镜单次生成记录（支持重新生成与历史）"""

    __tablename__ = "script_segment_generations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    segment_id: Mapped[int] = mapped_column("segmentId", ForeignKey("script_segments.id", ondelete="CASCADE"))
    script_id: Mapped[int] = mapped_column("scriptId", ForeignKey("video_scripts.id", ondelete="CASCADE"))
    task_id: Mapped[int | None] = mapped_column("taskId", ForeignKey("video_generation_tasks.id", ondelete="SET NULL"))
    persona_id: Mapped[int | None] = mapped_column("personaId", ForeignKey("personas.id", ondelete="SET NULL"))
    user_prompt: Mapped[str] = mapped_column("userPrompt", Text)
    expanded_prompt: Mapped[str | None] = mapped_column("expandedPrompt", Text)
    reference_image_urls: Mapped[list | dict | None] = mapped_column("referenceImageUrls", JSON)
    reference_image_keys: Mapped[list | dict | None] = mapped_column("referenceImageKeys", JSON)
    duration: Mapped[int | None] = mapped_column(Integer)
    resolution: Mapped[str | None] = mapped_column(String(50), server_default="720p")
    aspect_ratio: Mapped[str | None] = mapped_column("aspectRatio", String(10), server_default="16:9")
    sound: Mapped[bool] = mapped_column(Boolean, server_default="true")
    model_name: Mapped[str | None] = mapped_column("modelName", String(64), server_default="kling-v3")
    status: Mapped[str] = mapped_column(task_status_enum, server_default="pending")
    video_key: Mapped[str | None] = mapped_column("videoKey", String(512))
    video_url: Mapped[str | None] = mapped_column("videoUrl", String(1024))
    error_message: Mapped[str | None] = mapped_column("errorMessage", Text)
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, server_default="true")
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column("updatedAt", DateTime, server_default=func.now())

    segment: Mapped[ScriptSegment] = relationship(back_populates="generations")


class ScriptAssembly(Base):
    """脚本成片整合结果"""

    __tablename__ = "script_assemblies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    script_id: Mapped[int] = mapped_column("scriptId", ForeignKey("video_scripts.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column("userId", ForeignKey("users.id", ondelete="CASCADE"))
    video_key: Mapped[str] = mapped_column("videoKey", String(512))
    video_url: Mapped[str] = mapped_column("videoUrl", String(1024))
    segment_order: Mapped[list | dict] = mapped_column("segmentOrder", JSON)
    segment_generation_ids: Mapped[list | dict | None] = mapped_column("segmentGenerationIds", JSON)
    duration: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(task_status_enum, server_default="completed")
    is_active: Mapped[bool] = mapped_column("isActive", Boolean, server_default="true")
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column("updatedAt", DateTime, server_default=func.now())

    script: Mapped[VideoScript] = relationship(
        back_populates="assemblies",
        foreign_keys=[script_id],
    )


class TechTopicSearch(Base):
    """热门技术话题搜索记录"""

    __tablename__ = "tech_topic_searches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column("userId", ForeignKey("users.id", ondelete="CASCADE"))
    query: Mapped[str | None] = mapped_column(String(512))
    topics: Mapped[list | dict] = mapped_column(JSON)
    topic_count: Mapped[int] = mapped_column("topicCount", Integer, server_default="0")
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, server_default=func.now())
