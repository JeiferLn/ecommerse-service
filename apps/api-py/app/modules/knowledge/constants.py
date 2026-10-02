REQUIRED_KNOWLEDGE_TYPES: tuple[str, ...] = ("guide", "faq", "warranty", "policy")
"""Los 4 PDFs que mejoran las respuestas del asistente (opcionales)."""

KNOWLEDGE_DOCUMENT_TYPE_LABELS: dict[str, str] = {
    "guide": "Guía del asistente",
    "faq": "FAQ",
    "warranty": "Política de garantías",
    "policy": "Políticas de la tienda",
}

KNOWLEDGE_DOCUMENT_TYPE_REASONS: dict[str, str] = {
    "guide": (
        "Instrucciones para el bot: tono, qué puede y no puede hacer, cuándo escalar a un humano, "
        "y cómo presentar productos o precios."
    ),
    "faq": (
        "Preguntas frecuentes ya resueltas (horarios, tallas, stock, medios de pago, tiempos de respuesta). "
        "El bot las usa para responder sin inventar."
    ),
    "warranty": (
        "Condiciones de garantía: cobertura, plazos, qué sí/no aplica, cómo reclamar y qué datos o "
        "evidencia pedir al cliente."
    ),
    "policy": (
        "Reglas de la tienda: envíos y zonas, cambios/devoluciones, cancelaciones, datos de contacto y "
        "cualquier política que el cliente deba conocer."
    ),
}
