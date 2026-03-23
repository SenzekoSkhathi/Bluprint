from functools import lru_cache
from pathlib import Path
from typing import ClassVar, List

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config: ClassVar[SettingsConfigDict] = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Bluprint Backend"
    app_env: str = Field(default="development", alias="APP_ENV")

    aws_access_key_id: str = Field(alias="AWS_ACCESS_KEY_ID")
    aws_secret_access_key: str = Field(alias="AWS_SECRET_ACCESS_KEY")
    aws_region: str = Field(default="ap-southeast-2", alias="AWS_REGION")
    aws_s3_handbook_bucket: str = Field(
        validation_alias=AliasChoices("AWS_S3_HANDBOOK_BUCKET", "AWS_BUCKET_NAME")
    )
    aws_s3_handbook_prefix: str = Field(default="", alias="AWS_S3_HANDBOOK_PREFIX")
    max_handbook_bytes: int = Field(default=25_000_000, alias="MAX_HANDBOOK_BYTES")

    gemini_api_key: str = Field(alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_MODEL")
    gemini_fast_model: str = Field(
        default="gemini-2.5-flash",
        alias="GEMINI_FAST_MODEL",
    )
    gemini_thinking_model: str = Field(
        default="gemini-2.5-pro",
        alias="GEMINI_THINKING_MODEL",
    )
    gemini_collector_model: str = Field(
        default="gemini-2.5-pro",
        alias="GEMINI_COLLECTOR_MODEL",
    )
    gemini_embedding_model: str = Field(
        default="text-embedding-004", alias="GEMINI_EMBEDDING_MODEL"
    )
    embedding_batch_size: int = Field(default=32, alias="EMBEDDING_BATCH_SIZE")

    backend_data_dir: str = Field(default="./data", alias="BACKEND_DATA_DIR")
    chunk_size_chars: int = Field(default=1200, alias="CHUNK_SIZE_CHARS")
    chunk_overlap_chars: int = Field(default=180, alias="CHUNK_OVERLAP_CHARS")

    science_handbook_keywords_raw: str = Field(
        default="science,bachelor of science,bsc,school of science",
        alias="SCIENCE_HANDBOOK_KEYWORDS",
    )
    frontend_allowed_origins_raw: str = Field(
        default="*",
        alias="FRONTEND_ALLOWED_ORIGINS",
    )
    auth_shared_password: str = Field(default="", alias="AUTH_SHARED_PASSWORD")
    auth_password_hash_sha256: str = Field(
        default="", alias="AUTH_PASSWORD_HASH_SHA256"
    )
    auth_password_salt: str = Field(default="", alias="AUTH_PASSWORD_SALT")
    auth_session_ttl_minutes: int = Field(default=480, alias="AUTH_SESSION_TTL_MINUTES")

    @property
    def science_handbook_keywords(self) -> List[str]:
        return [item.strip().lower() for item in self.science_handbook_keywords_raw.split(",") if item.strip()]

    @property
    def frontend_allowed_origins(self) -> List[str]:
        return [
            item.strip()
            for item in self.frontend_allowed_origins_raw.split(",")
            if item.strip()
        ] or ["*"]

    @property
    def resolved_data_dir(self) -> Path:
        data_dir = Path(self.backend_data_dir)
        if data_dir.is_absolute():
            return data_dir.resolve()
        return (BACKEND_ROOT / data_dir).resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()
