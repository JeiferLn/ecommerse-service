import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MercadoPagoConfig, Payment, Preference } from "mercadopago";

@Injectable()
export class MercadoPagoService implements OnModuleInit {
  private readonly logger = new Logger(MercadoPagoService.name);
  private client: MercadoPagoConfig | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const accessToken = this.configService.get<string>("MP_ACCESS_TOKEN")?.trim();
    if (!accessToken) {
      this.logger.warn(
        "MP_ACCESS_TOKEN no configurado: Mercado Pago deshabilitado hasta agregar credenciales.",
      );
      return;
    }

    this.client = new MercadoPagoConfig({
      accessToken,
      options: { timeout: 10_000 },
    });
    this.logger.log("SDK de Mercado Pago inicializado (credenciales de plataforma).");
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  getPublicKey(): string | null {
    return this.configService.get<string>("MP_PUBLIC_KEY")?.trim() || null;
  }

  /** URL que Mercado Pago llamará al cambiar el estado del pago. */
  getWebhookNotificationUrl(): string | null {
    const explicit = this.configService.get<string>("MP_WEBHOOK_URL")?.trim();
    if (explicit) {
      return explicit.replace(/\/$/, "");
    }
    const apiPublic = this.configService.get<string>("API_PUBLIC_URL")?.trim();
    if (!apiPublic) {
      return null;
    }
    return `${apiPublic.replace(/\/$/, "")}/api/v1/payments/mercadopago/webhook`;
  }

  /** Cliente configurado con el access token de la plataforma (o el que se pase). */
  getClient(accessToken?: string): MercadoPagoConfig {
    if (accessToken?.trim()) {
      return new MercadoPagoConfig({
        accessToken: accessToken.trim(),
        options: { timeout: 10_000 },
      });
    }
    if (!this.client) {
      throw new Error("Mercado Pago no está configurado (falta MP_ACCESS_TOKEN)");
    }
    return this.client;
  }

  preferenceApi(accessToken?: string): Preference {
    return new Preference(this.getClient(accessToken));
  }

  paymentApi(accessToken?: string): Payment {
    return new Payment(this.getClient(accessToken));
  }

  async getPayment(paymentId: string | number) {
    return this.paymentApi().get({ id: paymentId });
  }
}
