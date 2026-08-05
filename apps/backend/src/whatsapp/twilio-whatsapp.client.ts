import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env.validation";
import { toTwilioWhatsAppAddress } from "./phone.util";

export interface SendTextParams {
  /** Número Twilio WhatsApp de la empresa (E.164). */
  from: string;
  /** Cliente (E.164 o whatsapp:+…). */
  to: string;
  text: string;
}

export interface SendTextResult {
  simulated: boolean;
  wamid: string | null;
}

@Injectable()
export class TwilioWhatsAppClient {
  private readonly logger = new Logger(TwilioWhatsAppClient.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async sendText(params: SendTextParams): Promise<SendTextResult> {
    const accountSid = this.config.get("TWILIO_ACCOUNT_SID", { infer: true })?.trim();
    const authToken = this.config.get("TWILIO_AUTH_TOKEN", { infer: true })?.trim();
    const simulate =
      this.config.get("WHATSAPP_SIMULATE_SEND", { infer: true }) ||
      !accountSid ||
      !authToken ||
      accountSid.startsWith("dummy") ||
      accountSid.startsWith("test-") ||
      authToken.startsWith("dummy") ||
      authToken.startsWith("test-");

    if (simulate) {
      const wamid = `SM_sim_${Date.now()}`;
      this.logger.log(
        `Simulated Twilio WhatsApp send to ${params.to} from ${params.from}: ${params.text.slice(0, 80)}`,
      );
      return { simulated: true, wamid };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({
      From: toTwilioWhatsAppAddress(params.from),
      To: toTwilioWhatsAppAddress(params.to),
      Body: params.text,
    });

    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      this.logger.error(`Twilio API error ${response.status}: ${errorBody}`);
      throw new Error(`Twilio respondió ${response.status}`);
    }

    const data = (await response.json()) as { sid?: string };
    return {
      simulated: false,
      wamid: data.sid ?? null,
    };
  }
}
