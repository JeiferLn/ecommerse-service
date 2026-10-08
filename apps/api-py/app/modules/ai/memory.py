"""Memoria conversacional en tres niveles para el asistente de IA.

Niveles:
  1. Turno       – datos del mensaje actual (efímero, solo dentro de handle_message).
  2. Conversación – contexto acumulado de la sesión (en proceso, no persistido).
  3. Cliente      – solo nombre y preferencias explícitas persistidas entre sesiones.

Restricciones de seguridad:
  - La memoria NUNCA es fuente de precio, stock, SKU ni variante.
  - En el nivel cliente solo se almacenan nombre y preferencias explícitas
    (e.g. "prefiero talla M").  Nada de datos sensibles (teléfono, dirección,
    pago).
  - Los datos de preferencias se limpian de patrones sensibles antes de
    guardarse.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# Patrones de exclusión (datos sensibles que no deben guardarse en cliente)
# ---------------------------------------------------------------------------

_SENSITIVE_KEY_PATTERNS = re.compile(
    r"\b(precio|price|stock|sku|disponib|variante|tarjeta|contrase[nñ]a|"
    r"cedula|nit|pago|bancario|cuenta|cvv|pin)\b",
    re.IGNORECASE | re.ASCII,
)

_MAX_PREFERENCE_LENGTH = 120
_MAX_CLIENT_PREFERENCES = 8


def _is_safe_preference(value: str) -> bool:
    """Rechaza valores que contienen datos factuales (precio, stock…) o sensibles."""
    return not bool(_SENSITIVE_KEY_PATTERNS.search(value))


# ---------------------------------------------------------------------------
# Nivel 1: Turno (efímero – construido en cada invocación de generate_reply)
# ---------------------------------------------------------------------------


@dataclass
class TurnContext:
    """Contexto del mensaje actual.  Vive exclusivamente dentro de generate_reply()."""

    customer_text: str
    company_id: str
    conversation_id: str
    # Datos de herramientas del turno actual (populados por las tools, no por el historial).
    tool_facts: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Nivel 2: Conversación (acumulado de la sesión – en proceso, no BD)
# ---------------------------------------------------------------------------


@dataclass
class ConversationMemory:
    """Contexto acumulado de la sesión actual.

    Solo se guarda lo necesario para resolver follow-ups
    (e.g. el producto que se mencionó antes).
    NUNCA contiene precios, stocks ni SKUs derivados del historial.
    """

    mentioned_product_names: list[str] = field(default_factory=list)
    """Nombres de producto mencionados en la sesión (para follow-ups)."""
    last_intent: str | None = None
    """Último intento detectado (para contexto de follow-ups)."""

    def note_product(self, name: str) -> None:
        """Registra un nombre de producto sin duplicados (max 5)."""
        normalized = name.strip()
        if normalized and normalized not in self.mentioned_product_names:
            self.mentioned_product_names = (self.mentioned_product_names + [normalized])[-5:]

    def last_product(self) -> str | None:
        return self.mentioned_product_names[-1] if self.mentioned_product_names else None


# ---------------------------------------------------------------------------
# Nivel 3: Cliente (persistido – solo nombre y preferencias explícitas)
# ---------------------------------------------------------------------------


@dataclass
class ClientProfile:
    """Perfil mínimo del cliente que se persiste entre sesiones.

    Fuentes autorizadas: únicamente declaraciones explícitas del usuario
    ("me llamo…", "prefiero talla M").  Nunca se infiere desde el historial
    ni desde los datos de la BD (precio, stock, SKU).
    """

    name: str | None = None
    """Nombre declarado explícitamente por el cliente."""
    preferences: dict[str, str] = field(default_factory=dict)
    """Preferencias declaradas explícitamente (máx. _MAX_CLIENT_PREFERENCES entradas)."""

    def set_name(self, name: str) -> None:
        """Guarda el nombre limpiando espacios y truncando a 60 caracteres."""
        cleaned = name.strip()[:60]
        if cleaned:
            self.name = cleaned

    def set_preference(self, key: str, value: str) -> None:
        """Añade una preferencia solo si no contiene datos sensibles o factuales."""
        key_clean = key.strip()[:40]
        value_clean = value.strip()[:_MAX_PREFERENCE_LENGTH]
        if not key_clean or not value_clean:
            return
        if _is_safe_preference(key_clean) and _is_safe_preference(value_clean):
            if key_clean not in self.preferences and len(self.preferences) >= _MAX_CLIENT_PREFERENCES:
                # Límite alcanzado: no se añaden más
                return
            self.preferences[key_clean] = value_clean

    def to_prompt_hint(self) -> str:
        """Fragmento corto para incluir en el system prompt (nunca precio/stock)."""
        parts: list[str] = []
        if self.name:
            parts.append(f"El cliente se llama {self.name}.")
        for key, value in list(self.preferences.items())[:3]:
            parts.append(f"Prefiere {key}: {value}.")
        return " ".join(parts)

    # Serialización mínima (para guardar en caché/BD ligero)
    def to_dict(self) -> dict[str, Any]:
        return {"name": self.name, "preferences": dict(self.preferences)}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ClientProfile":
        profile = cls()
        raw_name = (data.get("name") or "").strip()
        if raw_name:
            profile.name = raw_name[:60]
        raw_prefs = data.get("preferences") or {}
        for k, v in list(raw_prefs.items())[:_MAX_CLIENT_PREFERENCES]:
            profile.set_preference(str(k), str(v))
        return profile


# ---------------------------------------------------------------------------
# Reglas de uso (documentadas como constantes para tests y documentación)
# ---------------------------------------------------------------------------

MEMORY_CANNOT_SET_PRICE = (
    "La memoria no es fuente de precio.  Cualquier precio debe venir de FactSet "
    "construido exclusivamente desde la BD (tool catalog)."
)
MEMORY_CANNOT_SET_STOCK = (
    "La memoria no es fuente de stock.  El estado de inventario viene de la BD."
)
