import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { type Transporter } from "nodemailer";

export interface SendPasswordResetParams {
  to: string;
  resetUrl: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>("SMTP_HOST");
    const port = this.configService.get<number>("SMTP_PORT");
    const user = this.configService.get<string>("SMTP_USER");
    const pass = this.configService.get<string>("SMTP_PASS");

    if (!host || !port || !user || !pass) {
      this.logger.warn(
        "SMTP no configurado (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS): los correos se loguearán en consola en modo preview.",
      );
      this.transporter = null;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  async sendPasswordReset({ to, resetUrl }: SendPasswordResetParams): Promise<void> {
    const from =
      this.configService.get<string>("MAIL_FROM") ??
      "Commerce AI SaaS <no-reply@commerce-ai.local>";
    const subject = "Restablece tu contraseña";
    const html = this.renderPasswordResetHtml(resetUrl);

    if (!this.transporter) {
      this.logger.log(`[Preview] Para: ${to} | Asunto: ${subject}\n${html}`);
      return;
    }

    await this.transporter.sendMail({ from, to, subject, html });
    this.logger.log(`Correo de reset enviado a ${to}`);
  }

  private renderPasswordResetHtml(resetUrl: string): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #111827;">
        <h2 style="margin: 0 0 16px;">Restablece tu contraseña</h2>
        <p style="margin: 0 0 24px; color: #4b5563;">
          Recibimos una solicitud para restablecer la contraseña de tu cuenta. El enlace es válido por 1 hora.
        </p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #111827; color: #ffffff; text-decoration: none; border-radius: 8px;">
          Restablecer contraseña
        </a>
        <p style="margin: 24px 0 0; color: #6b7280; font-size: 13px;">
          Si no solicitaste este cambio, ignora este correo. El enlace solo puede usarse una vez.
        </p>
      </div>
    `;
  }
}
