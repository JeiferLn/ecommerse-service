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

export interface SendMediaParams {
  from: string;
  to: string;
  mediaUrl: string;
  caption?: string;
}

export interface SendContentParams {
  from: string;
  to: string;
  /** Contenido de Twilio Content API (HX…). */
  contentSid: string;
  variables?: Record<string, string>;
}

export interface SendTextResult {
  simulated: boolean;
  wamid: string | null;
}

@Injectable()
export class TwilioWhatsAppClient {
  private readonly logger = new Logger(TwilioWhatsAppClient.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  /** Credenciales reales de la cuenta, o null si los envíos se simulan. */
  credentials(): { accountSid: string; authToken: string } | null {
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
    return simulate || !accountSid || !authToken ? null : { accountSid, authToken };
  }

  async sendContent(params: SendContentParams): Promise<SendTextResult> {
    return this.dispatch({
      from: params.from,
      to: params.to,
      contentSid: params.contentSid,
      contentVariables: params.variables,
    });
  }

  async sendText(params: SendTextParams): Promise<SendTextResult> {
    return this.dispatch({
      from: params.from,
      to: params.to,
      body: params.text,
    });
  }

  async sendMedia(params: SendMediaParams): Promise<SendTextResult> {
    return this.dispatch({
      from: params.from,
      to: params.to,
      body: params.caption?.trim() || undefined,
      mediaUrl: params.mediaUrl,
    });
  }

  private async dispatch(params: {
    from: string;
    to: string;
    body?: string;
    mediaUrl?: string;
    contentSid?: string;
    contentVariables?: Record<string, string>;
  }): Promise<SendTextResult> {
    const account = this.credentials();
    if (!account) {
      const wamid = `SM_sim_${Date.now()}`;
      this.logger.log(
        `Envío local simulado (sin Twilio) to ${params.to} from ${params.from}` +
          (params.mediaUrl ? ` media=${params.mediaUrl}` : "") +
          (params.contentSid ? ` content=${params.contentSid}` : "") +
          (params.body ? `: ${params.body.slice(0, 80)}` : ""),
      );
      return { simulated: true, wamid };
    }
    const { accountSid, authToken } = account;

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({
      From: toTwilioWhatsAppAddress(params.from),
      To: toTwilioWhatsAppAddress(params.to),
    });
    if (params.body) {
      body.set("Body", params.body);
    }
    if (params.mediaUrl) {
      body.set("MediaUrl", params.mediaUrl);
    }
    if (params.contentSid) {
      body.set("ContentSid", params.contentSid);
      if (params.contentVariables) {
        body.set("ContentVariables", JSON.stringify(params.contentVariables));
      }
    }

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
