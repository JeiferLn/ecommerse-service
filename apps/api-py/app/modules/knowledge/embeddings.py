import hashlib
import logging
import math
import re
from typing import Protocol

import httpx

from app.core.config import get_settings
from app.core.text import strip_accents

logger = logging.getLogger("app.knowledge.embeddings")


class EmbeddingProvider(Protocol):
    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class MockEmbeddingProvider:
    """Embeddings deterministas para tests/dev sin API key."""

    async def embed(self, texts: list[str]) -> list[list[float]]:
        dimensions = get_settings().EMBEDDING_DIMENSIONS
        return [hash_to_vector(text, dimensions) for text in texts]


def hash_to_vector(text: str, dimensions: int) -> list[float]:
    normalized = strip_accents(text.lower()).strip()
    vector = [0.0] * dimensions
    tokens = [token for token in re.split(r"[^a-z0-9]+", normalized) if len(token) >= 2]
    for token in tokens or ["empty"]:
        digest = hashlib.sha256(token.encode()).digest()
        for byte in digest:
            index = byte % dimensions
            vector[index] += ((byte % 17) - 8) / 8
    norm = math.sqrt(sum(value * value for value in vector)) or 1
    return [value / norm for value in vector]


class OpenRouterEmbeddingProvider:
    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        settings = get_settings()
        api_key = (settings.OPENROUTER_API_KEY or "").strip()
        if not api_key:
            raise RuntimeError("OPENROUTER_API_KEY no configurada para embeddings")
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        if settings.AI_HTTP_REFERER:
            headers["HTTP-Referer"] = settings.AI_HTTP_REFERER
        if settings.AI_APP_TITLE:
            headers["X-Title"] = settings.AI_APP_TITLE

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{settings.AI_BASE_URL.rstrip('/')}/embeddings",
                headers=headers,
                json={"model": settings.EMBEDDING_MODEL, "input": texts},
            )
        if response.status_code >= 400:
            logger.error("OpenRouter embeddings error %s: %s", response.status_code, response.text[:300])
            raise RuntimeError(f"OpenRouter embeddings respondió {response.status_code}")

        rows = response.json().get("data") or []
        if len(rows) != len(texts):
            raise RuntimeError("OpenRouter embeddings devolvió un número inesperado de vectores")
        result: list[list[float]] = []
        for row in sorted(rows, key=lambda item: item.get("index") or 0):
            embedding = row.get("embedding")
            if not embedding:
                raise RuntimeError("OpenRouter embeddings devolvió un vector vacío")
            result.append(embedding)
        return result


def get_embedding_provider() -> EmbeddingProvider:
    settings = get_settings()
    if settings.EMBEDDING_PROVIDER == "mock" or not (settings.OPENROUTER_API_KEY or "").strip():
        return MockEmbeddingProvider()
    return OpenRouterEmbeddingProvider()


def vector_to_sql_literal(embedding: list[float]) -> str:
    return "[" + ",".join(repr(float(value)) for value in embedding) + "]"
