import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env.validation";

export interface SendTextParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  text: string;
}

export interface SendTextResult {
  simulated: boolean;
  wamid: string | null;
}

@Injectable()
export class WhatsAppCloudClient {
  private readonly logger = new Logger(WhatsAppCloudClient.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async sendText(params: SendTextParams): Promise<SendTextResult> {
    const simulate =
      this.config.get("WHATSAPP_SIMULATE_SEND", { infer: true }) ||
      !params.accessToken ||
      params.accessToken.startsWith("dummy") ||
      params.accessToken.startsWith("test-");

    if (simulate) {
      const wamid = `wamid.sim.${Date.now()}`;
      this.logger.log(
        `Simulated WhatsApp send to ${params.to} via ${params.phoneNumberId}: ${params.text.slice(0, 80)}`,
      );
      return { simulated: true, wamid };
    }

    const version = this.config.get("WHATSAPP_GRAPH_API_VERSION", { infer: true });
    const url = `https://graph.facebook.com/${version}/${params.phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: params.to,
        type: "text",
        text: { body: params.text },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      this.logger.error(`Graph API error ${response.status}: ${errorBody}`);
      throw new Error(`WhatsApp Graph API respondió ${response.status}`);
    }

    const data = (await response.json()) as {
      messages?: Array<{ id?: string }>;
    };
    return {
      simulated: false,
      wamid: data.messages?.[0]?.id ?? null,
    };
  }
}
