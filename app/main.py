import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from redis.exceptions import RedisError

from app.api.v1.api import api_router
from app.api.v1.endpoints.llm_routes import router as llm_router
from app.core.config import settings
from app.core.database import async_session_factory, create_all_tables, engine
from app.core.logging import setup_logging
from app.core.redis import close_store, get_store, init_store
from app.services.llm_service import init_gemma_model
from app.services.user_service import ensure_super_admin

setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_store()

    # Load Gemma 2 in a background thread so FastAPI starts instantly
    asyncio.create_task(asyncio.to_thread(init_gemma_model))

    if settings.AUTO_CREATE_TABLES:
        await create_all_tables()
    async with async_session_factory() as session:
        await ensure_super_admin(session)
    if settings.SEED_DEMO_DATA:
        from seed.seed_data import seed_demo

        await seed_demo()
    yield
    await close_store()
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
)

# Unconditional CORS configuration for local development and browser clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Authorization"],
)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)

    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > settings.MAX_UPLOAD_BYTES + 2 * 1024 * 1024:
        return JSONResponse({"detail": "Request body too large"}, status_code=413)

    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    if request.url.path.startswith(settings.API_V1_PREFIX):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


@app.exception_handler(Exception)
async def global_exception_handler(_: Request, exc: Exception):
    """Attaches CORS headers explicitly to 500 server error responses."""
    logger.error("Unhandled internal server exception: %s", str(exc), exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "*",
        },
    )


@app.exception_handler(RedisError)
async def redis_down(_: Request, exc: RedisError):
    logger.error("Redis failure: %s", type(exc).__name__)
    return JSONResponse(
        {"detail": "Auth/cache backend unavailable, retry shortly"},
        status_code=503,
        headers={"Access-Control-Allow-Origin": "*"},
    )


@app.get("/", include_in_schema=False)
async def root_redirect():
    """Redirects root path requests to Swagger interactive API documentation."""
    return RedirectResponse(url="/docs")


@app.get("/health", tags=["meta"])
async def health():
    """Liveness probe for system dependencies."""
    from sqlalchemy import text

    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return {"status": "ok", "redis": await get_store().ping(), "ai_provider": settings.AI_PROVIDER}


# Include core routes and Gemma 2 LLM routes
app.include_router(api_router, prefix=settings.API_V1_PREFIX)
app.include_router(llm_router, prefix=settings.API_V1_PREFIX)