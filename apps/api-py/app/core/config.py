from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

API_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = API_ROOT.parents[1]

DEV_JWT_MARKER = "dev-only"


def _unescape_quotes(value: str) -> str:
    """dotenv deja `\\"` literal dentro de comillas dobles."""
    return value.replace('\\"', '"')


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=API_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    NODE_ENV: Literal["development", "test", "production"] = "development"
    PORT: int = Field(default=4000, gt=0)
    DATABASE_URL: str = Field(min_length=1)
    CORS_ORIGIN: str = "http://localhost:3000"
    FRONTEND_URL: str = "http://localhost:3000"
    JWT_SECRET: str = Field(min_length=32)
    ACCESS_TOKEN_TTL_SECONDS: int = Field(default=15 * 60, gt=0)
    REFRESH_TOKEN_TTL_SECONDS: int = Field(default=7 * 24 * 60 * 60, gt=0)
    RESET_TOKEN_TTL_SECONDS: int = Field(default=60 * 60, gt=0)
    SMTP_HOST: str | None = None
    SMTP_PORT: int | None = None
    SMTP_USER: str | None = None
    SMTP_PASS: str | None = None
    MAIL_FROM: str | None = None
    COOKIE_SECURE: bool = False
    R2_ACCOUNT_ID: str | None = None
    R2_ACCESS_KEY_ID: str | None = None
    R2_SECRET_ACCESS_KEY: str | None = None
    R2_BUCKET: str | None = None
    R2_PUBLIC_URL: str | None = None
    API_PUBLIC_URL: str | None = None
    LOCAL_UPLOAD_DIR: str | None = None
    TWILIO_ACCOUNT_SID: str | None = None
    TWILIO_AUTH_TOKEN: str | None = None
    TWILIO_SKIP_SIGNATURE: bool = False
    TWILIO_WEBHOOK_URL: str | None = None
    TWILIO_SHARED_WHATSAPP_NUMBER: str | None = None
    WHATSAPP_AUTO_REPLY_ENABLED: bool = True
    WHATSAPP_AUTO_REPLY_TEXT: str = "Gracias por tu mensaje. Te responderemos pronto."
    WHATSAPP_SIMULATE_SEND: bool = False
    WHATSAPP_INTERACTIVE_ENABLED: bool = True
    TWILIO_CHECKOUT_CONTENT_SID: str | None = None
    AI_ENABLED: bool = True
    AI_PROVIDER: Literal["openrouter", "openai", "mock"] = "openrouter"
    OPENROUTER_API_KEY: str | None = None
    AI_BASE_URL: str = "https://openrouter.ai/api/v1"
    AI_MODEL: str = "openrouter/free"
    AI_MAX_PRODUCTS: int = Field(default=25, gt=0)
    AI_HISTORY_LIMIT: int = Field(default=8, gt=0)
    AI_FALLBACK_TEXT: str = (
        "Gracias por tu mensaje. En un momento un asesor de la tienda te atenderá por aquí."
    )
    AI_HTTP_REFERER: str | None = None
    AI_APP_TITLE: str = "Commerce AI SaaS"
    WHATSAPP_HANDLER_CHOICE_TEXT: str = (
        "¡Hola! ¿Prefieres que te atienda el asistente virtual (bot) o un asesor de la tienda? "
        'Responde "bot" o "asesor".'
    )
    WHATSAPP_HANDLER_BOT_CONFIRM_TEXT: str = (
        "Perfecto. Te atiende el asistente virtual. ¿En qué te puedo ayudar?"
    )
    WHATSAPP_HANDLER_HUMAN_CONFIRM_TEXT: str = (
        "Listo. Un asesor de la tienda continuará esta conversación por aquí."
    )
    EMBEDDING_PROVIDER: Literal["openrouter", "mock"] = "openrouter"
    EMBEDDING_MODEL: str = "openai/text-embedding-3-small"
    EMBEDDING_DIMENSIONS: int = Field(default=1536, gt=0)
    RAG_TOP_K: int = Field(default=4, gt=0)
    RAG_CHUNK_SIZE: int = Field(default=700, gt=0)
    RAG_CHUNK_OVERLAP: int = Field(default=80, ge=0)
    MP_CLIENT_ID: str | None = None
    MP_CLIENT_SECRET: str | None = None
    MP_REDIRECT_URI: str | None = None
    MP_ACCESS_TOKEN: str | None = None
    MP_PUBLIC_KEY: str | None = None
    MP_TEST_PAYER_EMAIL: str | None = None
    MP_WEBHOOK_URL: str | None = None
    BILLING_ALLOW_DEV_UPGRADE: bool = False

    @field_validator("SMTP_PORT", mode="before")
    @classmethod
    def _empty_port(cls, value: object) -> object:
        return None if value in ("", None) else value

    @field_validator(
        "WHATSAPP_AUTO_REPLY_TEXT",
        "AI_FALLBACK_TEXT",
        "WHATSAPP_HANDLER_CHOICE_TEXT",
        "WHATSAPP_HANDLER_BOT_CONFIRM_TEXT",
        "WHATSAPP_HANDLER_HUMAN_CONFIRM_TEXT",
    )
    @classmethod
    def _bot_text(cls, value: str) -> str:
        return _unescape_quotes(value)

    @model_validator(mode="after")
    def _production_rules(self) -> "Settings":
        errors: list[str] = []
        has_key = bool((self.OPENROUTER_API_KEY or "").strip())
        if self.NODE_ENV == "production":
            if self.AI_ENABLED and self.AI_PROVIDER == "openrouter" and not has_key:
                errors.append("En production con AI_ENABLED y openrouter se requiere OPENROUTER_API_KEY")
            if self.EMBEDDING_PROVIDER == "openrouter" and not has_key:
                errors.append(
                    "En production con EMBEDDING_PROVIDER=openrouter se requiere OPENROUTER_API_KEY"
                )
            if not self.COOKIE_SECURE:
                errors.append("En production COOKIE_SECURE debe ser true")
            if DEV_JWT_MARKER in self.JWT_SECRET.lower():
                errors.append("En production JWT_SECRET no puede ser el valor de desarrollo (dev-only)")
            if not self.WHATSAPP_SIMULATE_SEND and not (
                (self.TWILIO_ACCOUNT_SID or "").strip() and (self.TWILIO_AUTH_TOKEN or "").strip()
            ):
                errors.append(
                    "En production con WHATSAPP_SIMULATE_SEND=false se requieren "
                    "TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN"
                )
        if errors:
            raise ValueError("; ".join(errors))
        return self

    @property
    def is_production(self) -> bool:
        return self.NODE_ENV == "production"

    @property
    def async_database_url(self) -> str:
        """Convierte la URL de estilo Prisma (`?schema=public`) a SQLAlchemy + asyncpg."""
        parts = urlsplit(self.DATABASE_URL)
        query = [(k, v) for k, v in parse_qsl(parts.query) if k not in ("schema", "connection_limit")]
        scheme = "postgresql+asyncpg"
        return urlunsplit((scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGIN.split(",") if origin.strip()]

    @property
    def local_upload_dir(self) -> Path:
        configured = (self.LOCAL_UPLOAD_DIR or "").strip()
        if not configured:
            return API_ROOT / "uploads"
        path = Path(configured)
        return path if path.is_absolute() else (API_ROOT / path).resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
