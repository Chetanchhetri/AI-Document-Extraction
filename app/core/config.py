"""Application settings (12-factor: everything comes from environment variables)."""
from functools import lru_cache
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_DEFAULT_SECRET = "change-me-change-me-change-me-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- General -----------------------------------------------------------
    ENVIRONMENT: str = "development"  # development | production
    APP_NAME: str = "Customs IDP Backend"
    API_V1_PREFIX: str = "/api/v1"
    ENABLE_DOCS: bool = True  # forced off in production unless explicitly set
    CORS_ORIGINS: str = ""  # comma separated list
    LOG_LEVEL: str = "INFO"

    # --- Data stores -------------------------------------------------------
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/customs_idp"
    REDIS_URL: str = "redis://localhost:6379/0"  # "memory://" = in-process fallback (dev/tests only)
    AUTO_CREATE_TABLES: bool = False  # dev convenience; production uses Alembic
    DB_POOL_SIZE: int = 3
    DB_MAX_OVERFLOW: int = 2

    # --- Security ----------------------------------------------------------
    SECRET_KEY: str = _INSECURE_DEFAULT_SECRET
    AES_ENCRYPTION_KEY: str = ""  # 64 hex chars / 32-byte base64 / any >=32 char secret (HKDF-derived)
    JWT_ISSUER: str = "customs-idp"
    ACCESS_TOKEN_MINUTES: int = 15
    REFRESH_TOKEN_DAYS: int = 7
    OTP_TTL_SECONDS: int = 600
    OTP_MAX_ATTEMPTS: int = 5
    AUTH_RATE_LIMIT_MAX: int = 5
    AUTH_RATE_LIMIT_WINDOW_SECONDS: int = 900

    # --- Bootstrap ---------------------------------------------------------
    SUPERADMIN_EMAIL: str = ""
    SUPERADMIN_INIT_PASSWORD: str = ""
    SUPERADMIN_FULL_NAME: str = "Platform Super Admin"
    SEED_DEMO_DATA: bool = False  # seed SHP-24811 / SHP-24812 on startup (for hosts without a shell)
    SEED_DEMO_PASSWORD: str = ""  # if set, also creates demo manager/executive accounts

    # --- Mail (SMTP) -------------------------------------------------------
    SMTP_HOST: str = ""
    SMTP_PORT: int = 2525  # Render free blocks 25/465/587; 2525 works with Brevo/Mailgun/SendGrid
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "no-reply@example.com"
    SMTP_STARTTLS: bool = True

    # --- Uploads -----------------------------------------------------------
    UPLOAD_DIR: str = "./storage"
    MAX_UPLOAD_BYTES: int = 25 * 1024 * 1024
    MAX_PDF_PAGES: int = 50
    MAX_IMAGE_PIXELS: int = 40_000_000
    AI_MAX_PAGES: int = 3  # pages rendered & sent to the vision model per document
    AI_RENDER_DPI: int = 110  # bounding boxes are expressed in pixels at this DPI

    # --- AI ----------------------------------------------------------------
    AI_PROVIDER: str = "mock"  # mock | gemini | ollama
    AI_TIMEOUT_SECONDS: float = 120.0
    AI_EXTRA_HEADERS: str = '{"X-Zero-Data-Retention": "true", "Cache-Control": "no-store"}'
    GEMINI_API_KEY: str = ""
    GEMINI_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta"
    GEMINI_VISION_MODEL: str = "gemma-3-27b-it"
    GEMINI_EMBED_MODEL: str = "gemini-embedding-001"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_VISION_MODEL: str = "gemma3:4b"
    OLLAMA_EMBED_MODEL: str = "embeddinggemma"
    LOW_CONFIDENCE_THRESHOLD: float = 0.85
    HSN_MIN_SCORE: float = 0.35

    @model_validator(mode="after")
    def _production_guards(self) -> "Settings":
        if self.ENVIRONMENT.lower() == "production":
            if self.SECRET_KEY == _INSECURE_DEFAULT_SECRET or len(self.SECRET_KEY) < 32:
                raise ValueError("SECRET_KEY must be set to a random string of >= 32 chars in production")
            if len(self.AES_ENCRYPTION_KEY) < 32:
                raise ValueError("AES_ENCRYPTION_KEY must be set (>= 32 chars) in production")
            if self.REDIS_URL.startswith("memory://"):
                raise ValueError("REDIS_URL=memory:// is not allowed in production")
        return self

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    @property
    def docs_enabled(self) -> bool:
        return self.ENABLE_DOCS and not self.is_production

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def async_database_url(self) -> str:
        """Normalise Render/Heroku style URLs to the asyncpg driver."""
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        if url.startswith("postgresql://"):
            url = "postgresql+asyncpg://" + url[len("postgresql://"):]
        if url.startswith("postgresql+asyncpg://"):
            parts = urlsplit(url)
            query = [(k, v) for k, v in parse_qsl(parts.query) if k != "sslmode"]
            url = urlunsplit(parts._replace(query=urlencode(query)))
        return url

    @property
    def db_connect_args(self) -> dict:
        if "sslmode=require" in self.DATABASE_URL or "sslmode=verify" in self.DATABASE_URL:
            return {"ssl": True}
        return {}

    @property
    def is_sqlite(self) -> bool:
        return self.async_database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
