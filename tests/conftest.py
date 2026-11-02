import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="idp-test-")
os.environ.setdefault("REDIS_URL", "memory://")
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{_tmp}/test.db")  # override to test on Postgres
os.environ.update({
    "ENVIRONMENT": "development",
    "AUTO_CREATE_TABLES": "true", "SECRET_KEY": "test-secret-key-test-secret-key-test-secret",
    "AES_ENCRYPTION_KEY": "test-aes-key-test-aes-key-test-aes-key", "SUPERADMIN_EMAIL": "admin@customs.example",
    "SUPERADMIN_INIT_PASSWORD": "AdminPass123", "SEED_DEMO_PASSWORD": "DemoPass12345", "AI_PROVIDER": "mock",
    "UPLOAD_DIR": f"{_tmp}/storage", "AUTH_RATE_LIMIT_MAX": "100", "SEED_DEMO_DATA": "true",
})
