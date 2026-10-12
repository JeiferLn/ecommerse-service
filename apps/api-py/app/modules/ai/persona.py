"""Configuración de Persona y tono del asistente por empresa.

Valores por defecto:
  - assistant_name: None (sin nombre)
  - assistant_tone: 'neutral'
  - assistant_emoji_level: 'none'
  - assistant_style: 'friendly'
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

AssistantTone = Literal["casual", "neutral", "formal"]
AssistantEmojiLevel = Literal["none", "light", "expressive"]
AssistantStyle = Literal["warm", "professional", "friendly"]


@dataclass
class AssistantPersona:
    assistant_name: str | None = None
    assistant_tone: AssistantTone = "neutral"
    assistant_emoji_level: AssistantEmojiLevel = "none"
    assistant_style: AssistantStyle = "friendly"

    def to_system_prompt_snippet(self, company_name: str) -> str:
        """Genera las directrices de personalidad para inyectar en el system prompt."""
        lines: list[str] = []

        if self.assistant_name:
            lines.append(f'Te llamas {self.assistant_name} y eres el asistente virtual de "{company_name}".')
        else:
            lines.append(f'Eres el asistente virtual de la tienda "{company_name}".')

        # Tono
        if self.assistant_tone == "casual":
            lines.append("Tono de comunicación: casual, cercano, fresco y usando tuteo natural.")
        elif self.assistant_tone == "formal":
            lines.append("Tono de comunicación: formal, cortés, sobrio y usando trato de usted.")
        else:  # neutral
            lines.append("Tono de comunicación: neutral, equilibrado, claro y respetuoso.")

        # Estilo
        if self.assistant_style == "warm":
            lines.append("Estilo: cálido, empático, atento y comprensivo con las necesidades del cliente.")
        elif self.assistant_style == "professional":
            lines.append("Estilo: profesional, ejecutivo, directo y enfocado en la solución.")
        else:  # friendly
            lines.append("Estilo: amigable, servicial, optimista y facilitador.")

        # Emojis
        if self.assistant_emoji_level == "none":
            lines.append("Uso de emojis: NINGUNO. No utilices emojis en tus respuestas.")
        elif self.assistant_emoji_level == "expressive":
            lines.append("Uso de emojis: expresivo y alegre (2 a 3 emojis bien ubicados por respuesta).")
        else:  # light
            lines.append("Uso de emojis: sutil y moderado (máximo 1 emoji por mensaje si es adecuado).")

        return "\n".join(lines)

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> AssistantPersona:
        if not data:
            return cls()
        name = data.get("assistant_name")
        tone = data.get("assistant_tone", "neutral")
        emoji = data.get("assistant_emoji_level", "none")
        style = data.get("assistant_style", "friendly")

        valid_tones: set[AssistantTone] = {"casual", "neutral", "formal"}
        valid_emojis: set[AssistantEmojiLevel] = {"none", "light", "expressive"}
        valid_styles: set[AssistantStyle] = {"warm", "professional", "friendly"}

        return cls(
            assistant_name=str(name).strip() if name else None,
            assistant_tone=tone if tone in valid_tones else "neutral",
            assistant_emoji_level=emoji if emoji in valid_emojis else "none",
            assistant_style=style if style in valid_styles else "friendly",
        )
