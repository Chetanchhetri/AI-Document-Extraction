# Production & Local Deployment Guide

This document provides deployment guidelines, performance optimizations, and container configurations for running **Portline IDP** with local **Gemma 2 (2B)** inference.

---

## Hardware & System Requirements

### Recommended Server Specifications

| Resource | Minimum (Development) | Recommended (Production) |
| :--- | :--- | :--- |
| **CPU** | 4 Cores (x86-64) | 8+ Cores |
| **RAM** | 8 GB | 16 GB - 32 GB |
| **Storage** | 30 GB SSD | 100+ GB NVMe SSD |
| **Host HF Cache** | ~3 GB Free Space | ~10 GB Free Space |

---

## Container Architecture (`docker-compose.yml`)

The production deployment mounts the host system's Hugging Face cache directory into the API container. This prevents redundant model downloads on container restarts and preserves cached `.safetensors` files.

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: customs
      POSTGRES_PASSWORD: customs
      POSTGRES_DB: customs_idp
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U customs -d customs_idp"]
      interval: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--save", "", "--maxmemory", "64mb", "--maxmemory-policy", "noeviction"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 10

  api:
    build: .
    env_file:
      - .env
    environment:
      DATABASE_URL: postgresql+asyncpg://customs:customs@db:5432/customs_idp
      REDIS_URL: redis://redis:6379/0
      OLLAMA_BASE_URL: http://ollama:11434
      HF_TOKEN: ${HF_TOKEN}
    ports:
      - "8000:8000"
    volumes:
      - uploads:/app/storage
      - ${USERPROFILE}/.cache/huggingface:/root/.cache/huggingface
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

volumes:
  pgdata:
  uploads:
```

---

## Non-Blocking Startup & Thread Isolation

Loading large language models into CPU memory during FastAPI startup can block Uvicorn's event loop, resulting in HTTP connection timeouts and CORS errors on incoming login requests.

Portline IDP uses a deferred lifespan handler in `app/main.py`:

```python
@asynccontextmanager
async def lifespan(_: FastAPI):
    init_store()

    if settings.AUTO_CREATE_TABLES:
        await create_all_tables()
    async with async_session_factory() as session:
        await ensure_super_admin(session)

    # Schedule model initialization in a background thread AFTER Uvicorn port 8000 opens
    loop = asyncio.get_running_loop()
    loop.call_soon(lambda: asyncio.create_task(asyncio.to_thread(init_gemma_model)))

    yield
    await close_store()
    await engine.dispose()
```

---

## Model Pre-Downloading & Cache Management

If model weights need to be updated or pre-cached prior to launching the system, use `snapshot_download` directly inside the Python container environment to avoid PyTorch initialization stalls:

### 1. Download Model Snapshot into Host Cache
```powershell
docker exec -it customs_idp_backend-api-1 python -c "import os; from huggingface_hub import snapshot_download; token = os.getenv('HF_TOKEN'); print('--> Downloading Gemma 2 (2B)...'); snapshot_download(repo_id='google/gemma-2-2b-it', token=token, max_workers=4); print('--> Download Complete!')"
```

### 2. Verify Cached Models inside Container
```powershell
docker exec -it customs_idp_backend-api-1 python -c "from huggingface_hub import scan_cache_dir; [print(f'Model: {r.repo_id} | Size: {r.size_on_disk_str}') for r in scan_cache_dir().repos]"
```

---

## Production Security & Maintenance Checklist

- [ ] **Lock Backend Base URL:** Ensure frontend configuration relies on `import.meta.env.VITE_API_BASE_URL` or static defaults rather than client-side user modifications.
- [ ] **Secure `HF_TOKEN`:** Store `HF_TOKEN` in secure environment variables or secret vaults; do not commit keys to source control.
- [ ] **Reverse Proxy SSL Termination:** Deploy NGINX or an AWS ALB in front of port `8000` with strict HTTP-to-HTTPS redirection and TLS 1.2+ encryption.
- [ ] **CORS Configuration:** Configure `allow_origin_regex` in `app/main.py` to allow authorized frontend production domain origins.