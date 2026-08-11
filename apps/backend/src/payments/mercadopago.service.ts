import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MercadoPagoConfig, Payment, PreApproval, Preference } from "mercadopago";
import type { PreApprovalResponse } from "mercadopago/dist/clients/preApproval/commonTypes";

import type { Env } from "../config/env.validation";
import { MercadoPagoConnectionService } from "./mercadopago-connection.service";

export type CreatePreapprovalParams = {
  reason: string;
  payerEmail: string;
  externalReference: string;
  backUrl: string;
  transactionAmount: number;
  currencyId: string;
  /** Cobros cada N unidades de frequencyType. */
  frequency: number;
  frequencyType: "months" | "days";
  notificationUrl?: string | null;
};

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

  preApprovalApi(accessToken: string): PreApproval {
    return new PreApproval(this.getClient(accessToken));
  }

  async createPreapproval(
    accessToken: string,
    params: CreatePreapprovalParams,
  ): Promise<PreApprovalResponse> {
    const body: Record<string, unknown> = {
      reason: params.reason,
      payer_email: params.payerEmail,
      external_reference: params.externalReference,
      back_url: params.backUrl,
      auto_recurring: {
        frequency: params.frequency,
        frequency_type: params.frequencyType,
        transaction_amount: params.transactionAmount,
        currency_id: params.currencyId,
      },
      status: "pending",
    };
    if (params.notificationUrl) {
      body.notification_url = params.notificationUrl;
    }
    return this.preApprovalApi(accessToken).create({
      body: body as Parameters<PreApproval["create"]>[0]["body"],
    });
  }

  async getPreapproval(accessToken: string, id: string): Promise<PreApprovalResponse> {
    return this.preApprovalApi(accessToken).get({ id });
  }

  async cancelPreapproval(accessToken: string, id: string): Promise<void> {
    await this.preApprovalApi(accessToken).update({
      id,
      body: { status: "cancelled" },
    });
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
