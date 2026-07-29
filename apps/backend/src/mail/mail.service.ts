import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get<string>('SMTP_PORT') ?? 587),
        secure: false,
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        },
      });
    }
  }

  async sendInvitationEmail(params: {
    to: string;
    companyName: string;
    acceptUrl: string;
  }) {
    const from =
      this.config.get<string>('SMTP_FROM') ??
      'Commerce AI <noreply@commerce-ai.local>';
    const subject = `Invitación a ${params.companyName} en Commerce AI`;
    const text = [
      `Te invitaron a unirte a ${params.companyName} en Commerce AI.`,
      '',
      `Acepta la invitación aquí:`,
      params.acceptUrl,
      '',
      'Si no esperabas este correo, ignóralo.',
    ].join('\n');

    if (!this.transporter) {
      this.logger.log(
        `[DEV MAIL] Invitar a ${params.to} | ${params.acceptUrl}`,
      );
      return { queued: true, mode: 'console' as const };
    }

    await this.transporter.sendMail({
      from,
      to: params.to,
      subject,
      text,
    });

    return { queued: true, mode: 'smtp' as const };
  }
}
