from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[1]
_ROOT_DIR = _BACKEND_DIR.parent


def _env_files() -> list[Path]:
    files: list[Path] = []
    backend_env = _BACKEND_DIR / ".env"
    root_env = _ROOT_DIR / ".env"
    if backend_env.exists():
        files.append(backend_env)
    if root_env.exists():
        files.append(root_env)
    return files


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_env_files(), extra="ignore")

    database_url: str = ""
    vite_supabase_url: str = ""
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    kling_access_key: str = ""
    kling_secret_key: str = ""
    kling_api_base_url: str = "https://api-beijing.klingai.com"
    kling_model_name: str = "kling-v3"
    kling_default_mode: str = "std"
    tencent_cos_secret_id: str = ""
    tencent_cos_secret_key: str = ""
    tencent_cos_bucket: str = ""
    tencent_cos_region: str = "ap-shanghai"
    tencent_cos_cdn_url: str = Field(
        default="",
        validation_alias=AliasChoices("TENCENT_COS_CDN_URL", "TENCENT_COS_URL"),
    )
    dashscope_api_key: str = ""
    dashscope_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    dashscope_native_base_url: str = ""
    qwen_vl_model: str = "qwen-vl-max"
    qwen_image_edit_model: str = "qwen-image-edit-plus"
    qwen_text_model: str = "qwen-plus"
    qwen_audio_model: str = "qwen-audio-turbo"
    wanx_model: str = "wan2.2-t2i-flash"
    cors_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3001,http://127.0.0.1:3001"
    )


settings = Settings()
