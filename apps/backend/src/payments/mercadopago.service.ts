import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MercadoPagoConfig, Payment, Preference } from "mercadopago";

import type { Env } from "../config/env.validation";
import { MercadoPagoConnectionService } from "./mercadopago-connection.service";

@Injectable()
export class MercadoPagoService implements OnModuleInit {
  private readonly logger = new Logger(MercadoPagoService.name);

  constructor(
    private readonly configService: ConfigService<Env, true>,
    private readonly connections: MercadoPagoConnectionService,
  ) {}

  onModuleInit(): void {
    if (this.connections.isOAuthConfigured()) {
      this.logger.log("Mercado Pago OAuth de plataforma listo (MP_CLIENT_ID configurado).");
    } else {
      this.logger.warn(
        "MP OAuth no configurado: las empresas pueden pegar Access Token manualmente. Define MP_CLIENT_ID/SECRET/REDIRECT_URI para el botón Conectar.",
      );
    }
  }

  isPlatformOAuthConfigured(): boolean {
    return this.connections.isOAuthConfigured();
  }

  /** URL que Mercado Pago llamará al cambiar el estado del pago. */
  getWebhookNotificationUrl(): string | null {
    const explicit = this.configService.get("MP_WEBHOOK_URL", { infer: true })?.trim();
    if (explicit) {
      return explicit.replace(/\/$/, "");
    }
    const apiPublic = this.configService.get("API_PUBLIC_URL", { infer: true })?.trim();
    if (!apiPublic) {
      return null;
    }
    return `${apiPublic.replace(/\/$/, "")}/api/v1/payments/mercadopago/webhook`;
  }

  getClient(accessToken: string): MercadoPagoConfig {
    const token = accessToken.trim();
    if (!token) {
      throw new Error("Access Token de Mercado Pago vacío");
    }
    return new MercadoPagoConfig({
      accessToken: token,
      options: { timeout: 10_000 },
    });
  }

  preferenceApi(accessToken: string): Preference {
    return new Preference(this.getClient(accessToken));
  }

  paymentApi(accessToken: string): Payment {
    return new Payment(this.getClient(accessToken));
  }

  async getAccessTokenForCompany(companyId: string): Promise<string> {
    return this.connections.getValidAccessToken(companyId);
  }

  async preferenceApiForCompany(companyId: string): Promise<Preference> {
    const token = await this.getAccessTokenForCompany(companyId);
    return this.preferenceApi(token);
  }

  async getPaymentForCompany(companyId: string, paymentId: string | number) {
    const token = await this.getAccessTokenForCompany(companyId);
    return this.paymentApi(token).get({ id: paymentId });
  }
}
