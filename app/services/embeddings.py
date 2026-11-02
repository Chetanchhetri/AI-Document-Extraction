"""Semantic embedding engine (EmbeddingGemma via Ollama, Gemini Embedding API, or an offline mock)."""
from __future__ import annotations

import hashlib
import json
import math
import re

import httpx

from app.core.config import settings


def _headers() -> dict[str, str]:
    try:
        return {str(k): str(v) for k, v in json.loads(settings.AI_EXTRA_HEADERS or "{}").items()}
    except ValueError:
        return {}


def model_id() -> str:
    if settings.AI_PROVIDER == "ollama":
        return f"ollama:{settings.OLLAMA_EMBED_MODEL}"
    if settings.AI_PROVIDER == "gemini":
        return f"gemini:{settings.GEMINI_EMBED_MODEL}"
    return "mock:hash-256"


def _mock_embed(text: str, dims: int = 256) -> list[float]:
    """Deterministic hashed word + char-trigram vector. Lexical, not truly semantic - demo/offline only."""
    text = re.sub(r"[^a-z0-9 ]+", " ", text.lower())
    feats = text.split() + [text[i:i + 3] for i in range(max(len(text) - 2, 0))]
    vec = [0.0] * dims
    for f in feats:
        h = int(hashlib.md5(f.encode()).hexdigest(), 16)
        vec[h % dims] += 1.0 if (h >> 64) & 1 else -1.0
        vec[(h >> 8) % dims] += 0.5
    return _normalise(vec)


def _normalise(vec: list[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / n for x in vec]


def cosine(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        return 0.0
    return sum(x * y for x, y in zip(a, b))  # vectors are stored L2-normalised


async def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    provider = settings.AI_PROVIDER
    if provider == "ollama":
        async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS, headers=_headers()) as c:
            r = await c.post(f"{settings.OLLAMA_BASE_URL}/api/embed",
                             json={"model": settings.OLLAMA_EMBED_MODEL, "input": texts})
            r.raise_for_status()
            return [_normalise(v) for v in r.json()["embeddings"]]
    if provider == "gemini":
        out = []
        url = f"{settings.GEMINI_BASE_URL}/models/{settings.GEMINI_EMBED_MODEL}:embedContent"
        async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS,
                                     headers={**_headers(), "x-goog-api-key": settings.GEMINI_API_KEY}) as c:
            for t in texts:
                r = await c.post(url, json={"content": {"parts": [{"text": t}]},
                                            "taskType": "SEMANTIC_SIMILARITY"})
                r.raise_for_status()
                out.append(_normalise(r.json()["embedding"]["values"]))
        return out
    return [_mock_embed(t) for t in texts]


async def embed_one(text: str) -> dict:
    vec = (await embed_texts([text]))[0]
    return {"model": model_id(), "vector": [round(x, 6) for x in vec]}
