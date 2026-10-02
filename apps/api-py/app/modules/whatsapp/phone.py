import re


def normalize_whatsapp_e164(raw: str) -> str:
    """Normaliza números WhatsApp a E.164 con + (sin prefijo whatsapp:).

    Acepta: whatsapp:+57…, +57…, 57… (si ya trae + se conserva).
    """
    value = raw.strip()
    if value.lower().startswith("whatsapp:"):
        value = value[len("whatsapp:") :].strip()
    digits = re.sub(r"\D", "", value, flags=re.ASCII)
    if not digits:
        return ""
    return f"+{digits}"


def to_twilio_whatsapp_address(e164: str) -> str:
    return f"whatsapp:{normalize_whatsapp_e164(e164)}"
