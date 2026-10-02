import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { MessageInteractive } from "@commerce-ai/types";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";

import type { Env } from "../config/env.validation";
import { PrismaService } from "../prisma/prisma.service";
import { truncate, WA_LIMITS } from "./interactive-message.util";
import { TwilioWhatsAppClient } from "./twilio-whatsapp.client";

const CONTENT_API_URL = "https://content.twilio.com/v1/Content";

export interface ResolvedContent {
  contentSid: string;
  variables: Record<string, string>;
}

/**
 * Traduce un `MessageInteractive` a un contenido de Twilio Content API.
 * El cuerpo va como variable `{{1}}`, así un mismo juego de botones se crea una sola vez.
 */
@Injectable()
export class TwilioContentService {
  private readonly logger = new Logger(TwilioContentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly twilioClient: TwilioWhatsAppClient,
  ) {}

  /** Null cuando el tipo no se envía como contenido (respuesta del cliente, enlace sin plantilla…). */
  async resolve(interactive: MessageInteractive, body: string): Promise<ResolvedContent | null> {
    const variables = { "1": truncate(body, WA_LIMITS.body) || " " };

    if (interactive.kind === "link_button") {
      const contentSid = this.config.get("TWILIO_CHECKOUT_CONTENT_SID", { infer: true })?.trim();
      const token = interactive.url?.split("/checkout/")[1]?.split(/[?#]/)[0];
      return contentSid && token ? { contentSid, variables: { "1": token } } : null;
    }

    const spec = this.buildTypes(interactive);
    if (!spec) {
      return null;
    }
    const hash = createHash("sha256").update(JSON.stringify(spec)).digest("hex");
    const contentSid = await this.getOrCreate(hash, interactive.kind, spec);
    return { contentSid, variables };
  }

  private buildTypes(interactive: MessageInteractive): Record<string, unknown> | null {
    const text = { body: "{{1}}" };
    switch (interactive.kind) {
      case "buttons":
      case "product_card":
        return {
          "twilio/quick-reply": {
            body: "{{1}}",
            actions: interactive.actions.map((action) => ({ title: action.title, id: action.id })),
          },
          "twilio/text": text,
        };
      case "list":
        return {
          "twilio/list-picker": {
            body: "{{1}}",
            button: interactive.button,
            items: interactive.items.map((item) => ({
              item: item.title,
              id: item.id,
              ...(item.description ? { description: item.description } : {}),
            })),
          },
          "twilio/text": text,
        };
      default:
        return null;
    }
  }

  private async getOrCreate(
    hash: string,
    kind: string,
    types: Record<string, unknown>,
  ): Promise<string> {
    const account = this.twilioClient.credentials();
    if (!account) {
      return `HX_sim_${hash.slice(0, 24)}`;
    }

    const cached = await this.prisma.whatsAppContentTemplate.findUnique({ where: { hash } });
    if (cached) {
      return cached.contentSid;
    }

    const response = await fetch(CONTENT_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${account.accountSid}:${account.authToken}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        friendly_name: `commerce_ai_${kind}_${hash.slice(0, 16)}`,
        language: "es",
        variables: { "1": "Hola" },
        types,
      }),
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      this.logger.error(`Twilio Content API ${response.status}: ${errorBody}`);
      throw new Error(`Twilio Content API respondió ${response.status}`);
    }
    const data = (await response.json()) as { sid?: string };
    if (!data.sid) {
      throw new Error("Twilio Content API no devolvió sid");
    }

    try {
      await this.prisma.whatsAppContentTemplate.create({
        data: { hash, contentSid: data.sid, kind },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
        throw error;
      }
    }
    return data.sid;
  }
}
