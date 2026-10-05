import logging
import re
from dataclasses import dataclass
from typing import Literal, Protocol

import httpx

from app.core.config import get_settings
from app.core.text import strip_accents

logger = logging.getLogger("app.ai.providers")

HANDOFF_MARKER = "[HANDOFF]"
ChatRole = Literal["system", "user", "assistant"]


@dataclass
class ChatMessage:
    role: ChatRole
    content: str


@dataclass
class ChatCompletionResult:
    content: str
    model: str


class AiChatProvider(Protocol):
    async def complete(
        self,
        messages: list[ChatMessage],
        *,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> ChatCompletionResult: ...


PRODUCT_LINE_RE = re.compile(r"^- (.+?)(?:\s\[|\s—|\s\|)", re.MULTILINE)


class MockChatProvider:
    """Respuestas deterministas para dev/tests sin API key."""

    async def complete(
        self,
        messages: list[ChatMessage],
        *,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> ChatCompletionResult:
        last_user = next((m for m in reversed(messages) if m.role == "user"), None)
        text = last_user.content.lower() if last_user else ""
        normalized = strip_accents(text)

        if any(word in text for word in ("humano", "asesor", "handoff", "no hay productos")):
            return ChatCompletionResult(HANDOFF_MARKER, "mock")

        if re.search(
            r"\b(hola\s*mundo|hello\s*world|print\s*\(|programa(r|cion)|codigo\s+en\s+python)\b",
            normalized,
            re.ASCII,
        ):
            return ChatCompletionResult(
                "Solo puedo ayudarte con productos, pedidos y políticas de nuestra tienda. "
                "¿Buscas algo de nuestro catálogo?",
                "mock",
            )

        is_greeting = bool(
            re.match(
                r"(hola|buenas|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|hey|saludos)\b",
                text.strip(),
                re.ASCII,
            )
        ) and not re.search(r"(precio|stock|producto|cat[aá]logo|tienen|cuesta|talla|disponible)", text)
        if is_greeting:
            return ChatCompletionResult(
                "¡Hola! Bienvenido a nuestra tienda. ¿En qué te puedo ayudar hoy?", "mock"
            )

        catalog_hint = next((m.content for m in messages if m.role == "system"), "")
        product_names = [match.strip() for match in PRODUCT_LINE_RE.findall(catalog_hint) if match.strip()]
        overview_ask = re.search(
            r"(que venden|que tienen|que productos|catalogo|en stock|disponibles|que hay)", normalized
        )
        if overview_ask and product_names:
            listed = ", ".join(product_names[:3])
            return ChatCompletionResult(
                f"Ahora mismo tenemos: {listed}. ¿Quieres precio o más detalles de alguno?", "mock"
            )

        product_name = product_names[0] if product_names else "nuestros productos"
        return ChatCompletionResult(
            f"¡Claro! Sobre {product_name}: según nuestro catálogo activo te puedo ayudar. "
            "¿Quieres precio, stock o más detalles?",
            "mock",
        )


class OpenRouterChatProvider:
    """Cliente compatible OpenAI (OpenRouter u OpenAI cambiando `AI_BASE_URL`)."""

    async def complete(
        self,
        messages: list[ChatMessage],
        *,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> ChatCompletionResult:
        settings = get_settings()
        api_key = (settings.OPENROUTER_API_KEY or "").strip()
        if not api_key:
            raise RuntimeError("OPENROUTER_API_KEY no configurada")
        chosen_model = model or settings.AI_MODEL or "openrouter/free"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        if settings.AI_HTTP_REFERER:
            headers["HTTP-Referer"] = settings.AI_HTTP_REFERER
        if settings.AI_APP_TITLE:
            headers["X-Title"] = settings.AI_APP_TITLE

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{settings.AI_BASE_URL.rstrip('/')}/chat/completions",
                headers=headers,
                json={
                    "model": chosen_model,
                    "messages": [{"role": m.role, "content": m.content} for m in messages],
                    "temperature": 0.3 if temperature is None else temperature,
                    "max_tokens": 400 if max_tokens is None else max_tokens,
                },
            )
        if response.status_code >= 400:
            logger.error("OpenRouter error %s: %s", response.status_code, response.text[:300])
            raise RuntimeError(f"OpenRouter respondió {response.status_code}")

        data = response.json()
        choice = (data.get("choices") or [{}])[0] or {}
        raw = (choice.get("message") or {}).get("content") or choice.get("text")
        content = ""
        if isinstance(raw, str):
            content = raw.strip()
        elif isinstance(raw, list):
            content = "".join(part.get("text", "") for part in raw if isinstance(part, dict)).strip()
        if not content:
            logger.warning("OpenRouter empty content (model=%s). keys=%s", chosen_model, list(choice.keys()))
            raise RuntimeError("OpenRouter devolvió una respuesta vacía")
        return ChatCompletionResult(content, data.get("model") or chosen_model)


class GeminiChatProvider:
    """Gemini por HTTP. El tope de salida queda bajo para no gastar tokens de más."""

    _DEFAULT_MODEL = "gemini-2.5-flash"

    async def complete(
        self,
        messages: list[ChatMessage],
        *,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> ChatCompletionResult:
        settings = get_settings()
        api_key = (settings.GEMINI_API_KEY or "").strip()
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY no configurada")
        chosen = model or _gemini_model(settings.AI_MODEL)
        system = "\n\n".join(message.content for message in messages if message.role == "system")
        contents = [
            {
                "role": "user" if message.role == "user" else "model",
                "parts": [{"text": message.content}],
            }
            for message in messages
            if message.role != "system"
        ]
        if not contents:
            contents = [{"role": "user", "parts": [{"text": "Hola"}]}]
        body: dict[str, object] = {
            "contents": contents,
            "generationConfig": {
                "temperature": 0.2 if temperature is None else temperature,
                "maxOutputTokens": 250 if max_tokens is None else max_tokens,
            },
        }
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{chosen}:generateContent",
                headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
                json=body,
            )
        if response.status_code >= 400:
            logger.error("Gemini error %s: %s", response.status_code, response.text[:300])
            raise RuntimeError(f"Gemini respondió {response.status_code}")

        data = response.json()
        parts = ((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
        content = "".join(part.get("text", "") for part in parts if isinstance(part, dict)).strip()
        if not content:
            logger.warning("Gemini empty content (model=%s)", chosen)
            raise RuntimeError("Gemini devolvió una respuesta vacía")
        return ChatCompletionResult(content, chosen)


def _gemini_model(configured: str | None) -> str:
    model = (configured or "").strip()
    if model.startswith("gemini"):
        return model
    return GeminiChatProvider._DEFAULT_MODEL


def get_chat_provider() -> AiChatProvider:
    settings = get_settings()
    if settings.AI_PROVIDER == "mock":
        return MockChatProvider()
    if settings.AI_PROVIDER == "gemini":
        if (settings.GEMINI_API_KEY or "").strip():
            return GeminiChatProvider()
        logger.warning("AI_PROVIDER=gemini sin GEMINI_API_KEY; se usa OpenRouter")
    return OpenRouterChatProvider()
