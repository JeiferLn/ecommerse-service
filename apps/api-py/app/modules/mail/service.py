import logging
from email.message import EmailMessage

import aiosmtplib

from app.core.config import get_settings

logger = logging.getLogger("app.mail")
DEFAULT_FROM = "Commerce AI SaaS <no-reply@commerce-ai.local>"


def _render_password_reset_html(reset_url: str) -> str:
    return f"""
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #111827;">
        <h2 style="margin: 0 0 16px;">Restablece tu contraseña</h2>
        <p style="margin: 0 0 24px; color: #4b5563;">
          Recibimos una solicitud para restablecer la contraseña de tu cuenta. El enlace es válido por 1 hora.
        </p>
        <a href="{reset_url}" style="display: inline-block; padding: 12px 24px; background-color: #111827; color: #ffffff; text-decoration: none; border-radius: 8px;">
          Restablecer contraseña
        </a>
        <p style="margin: 24px 0 0; color: #6b7280; font-size: 13px;">
          Si no solicitaste este cambio, ignora este correo. El enlace solo puede usarse una vez.
        </p>
      </div>
    """  # noqa: E501


def _render_company_invitation_html(company_name: str, register_url: str) -> str:
    return f"""
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #111827;">
        <h2 style="margin: 0 0 16px;">Te invitaron a unirte a {company_name}</h2>
        <p style="margin: 0 0 24px; color: #4b5563;">
          Confirma que quieres unirte al equipo de {company_name}.
          Si ya tienes una cuenta, solo debes aceptar la invitación para empezar a colaborar.
        </p>
        <a href="{register_url}" style="display: inline-block; padding: 12px 24px; background-color: #111827; color: #ffffff; text-decoration: none; border-radius: 8px;">
          Aceptar invitación
        </a>
        <p style="margin: 24px 0 0; color: #6b7280; font-size: 13px;">
          Si no esperabas esta invitación, ignora este correo.
        </p>
      </div>
    """  # noqa: E501


class MailService:
    def __init__(self) -> None:
        settings = get_settings()
        self.host = settings.SMTP_HOST
        self.port = settings.SMTP_PORT
        self.user = settings.SMTP_USER
        self.password = settings.SMTP_PASS
        self.sender = settings.MAIL_FROM or DEFAULT_FROM
        self.enabled = bool(self.host and self.port and self.user and self.password)

    async def _send(self, to: str, subject: str, html: str) -> bool:
        if not self.enabled:
            logger.info("[Preview] Para: %s | Asunto: %s\n%s", to, subject, html)
            return False
        message = EmailMessage()
        message["From"] = self.sender
        message["To"] = to
        message["Subject"] = subject
        message.set_content(html, subtype="html")
        await aiosmtplib.send(
            message,
            hostname=self.host,
            port=self.port,
            username=self.user,
            password=self.password,
            use_tls=self.port == 465,
            start_tls=self.port != 465,
        )
        return True

    async def send_password_reset(self, *, to: str, reset_url: str) -> None:
        if await self._send(to, "Restablece tu contraseña", _render_password_reset_html(reset_url)):
            logger.info("Correo de reset enviado a %s", to)

    async def send_company_invitation(self, *, to: str, company_name: str, register_url: str) -> None:
        subject = f"{company_name} te ha invitado a unirte"
        if await self._send(to, subject, _render_company_invitation_html(company_name, register_url)):
            logger.info("Correo de invitación enviado a %s", to)


if not MailService().enabled:
    logger.warning(
        "SMTP no configurado (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS): "
        "los correos se loguearán en consola en modo preview."
    )
