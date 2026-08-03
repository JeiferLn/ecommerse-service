import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env.validation";
import { PrismaService } from "../prisma/prisma.service";
import { AiProviderFactory } from "./ai-provider.factory";
import { CatalogContextService } from "./catalog-context.service";
import { HANDOFF_MARKER, type ChatMessage } from "./ai.types";
import { formatCommercePromptBlock } from "./commerce-prompt";
import { buildSalesAssistantSystemPrompt } from "./prompts/sales-assistant";

export interface GenerateReplyInput {
  companyId: string;
  conversationId: string;
  customerText: string;
}

export interface GenerateReplyResult {
  text: string;
  requestedHandoff: boolean;
}

@Injectable()
export class AiReplyService {
  private readonly logger = new Logger(AiReplyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly providerFactory: AiProviderFactory,
    private readonly catalogContext: CatalogContextService,
  ) {}

  async generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult> {
    const fallback = this.config.get("AI_FALLBACK_TEXT", { infer: true });

    try {
      const catalog = await this.catalogContext.buildForCompany(
        input.companyId,
        input.customerText,
      );

      if (catalog.productCount === 0) {
        return { text: fallback, requestedHandoff: true };
      }

      const companyCommerce = await this.prisma.company.findUnique({
        where: { id: input.companyId },
        select: {
          countryCode: true,
          shippingScopes: true,
          paymentMethods: true,
          shippingCarriers: true,
          banks: true,
        },
      });
      const commerce = formatCommercePromptBlock(
        companyCommerce ?? {
          countryCode: null,
          shippingScopes: [],
          paymentMethods: [],
          shippingCarriers: [],
          banks: [],
        },
      );

      const historyLimit = this.config.get("AI_HISTORY_LIMIT", { infer: true });
      const recent = await this.prisma.message.findMany({
        where: { conversationId: input.conversationId },
        orderBy: { createdAt: "desc" },
        take: historyLimit,
        select: { direction: true, body: true },
      });

      const historyMessages: ChatMessage[] = recent
        .reverse()
        .map((message) => ({
          role: message.direction === "inbound" ? ("user" as const) : ("assistant" as const),
          content: message.body,
        }));

      if (
        historyMessages.length === 0 ||
        historyMessages[historyMessages.length - 1]?.content !== input.customerText
      ) {
        historyMessages.push({ role: "user", content: input.customerText });
      }

      const messages: ChatMessage[] = [
        {
          role: "system",
          content: buildSalesAssistantSystemPrompt({
            companyName: catalog.companyName,
            catalogBlock: catalog.catalogBlock,
            categoriesSummary: catalog.categoriesSummary,
            totalActiveCount: catalog.totalActiveCount,
            commerceBlock: commerce.block,
            commerceConfigured: commerce.configured,
          }),
        },
        ...historyMessages,
      ];

      const result = await this.providerFactory.getProvider().complete({
        messages,
        maxTokens: 220,
        temperature: 0.2,
      });
      const content = this.sanitizeModelOutput(result.content);

      if (!content || this.isHandoff(content) || this.looksLikeInternalReasoning(content)) {
        this.logger.warn(
          `AI handoff/empty/garbage reply for conversation=${input.conversationId}`,
        );
        return { text: fallback, requestedHandoff: true };
      }

      return {
        text: content.replace(HANDOFF_MARKER, "").trim() || fallback,
        requestedHandoff: false,
      };
    } catch (error) {
      this.logger.error(`AI reply failed: ${String(error)}`);
      return { text: fallback, requestedHandoff: false };
    }
  }

  sanitizeModelOutput(raw: string): string {
    const cleaned = raw
      .replace(/^\s*User Safety\s*:\s*\w+\s*/gim, "")
      .replace(/^\s*Response Safety\s*:\s*\w+\s*/gim, "")
      .replace(/\bUser Safety\s*:\s*\w+\b/gi, "")
      .replace(/\bResponse Safety\s*:\s*\w+\b/gi, "")
      .replace(/^\s*Safety\s*:\s*\w+\s*/gim, "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<\/?think>/gi, "")
      .trim();

    if (!cleaned || /^(user|response)?\s*safety\s*:?\s*safe$/i.test(cleaned)) {
      return "";
    }

    return cleaned;
  }

  /** Detecta monólogos / CoT que no deben llegar al cliente (modelos free suelen filtrarlos). */
  looksLikeInternalReasoning(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed.length > 650) {
      return true;
    }

    const signals = [
      /\bwait,?\s+wait\b/i,
      /\bhold on\b/i,
      /\boh no\b/i,
      /\bdiscrepanc/i,
      /\baccording to the rules\b/i,
      /\bthe assistant (made|previously|said)\b/i,
      /\blet me (think|check|analyze|see)\b/i,
      /\blooking at (the )?(catalog|history|previous)\b/i,
      /\bi (need to|must|should) (correct|not invent|use|fix)\b/i,
      /\bthis is a problem\b/i,
      /\bchain of thought\b/i,
      /Variantes:\s*.+\(sku\s+/i,
      /\bsku\s+\w+,\s*\$\d/i,
    ];

    const hits = signals.filter((pattern) => pattern.test(trimmed)).length;
    if (hits >= 2) {
      return true;
    }
    if (hits >= 1 && trimmed.length > 320) {
      return true;
    }

    const spanishMarks = (trimmed.match(/[áéíóúñ¿¡]/gi) ?? []).length;
    const englishHits = (
      trimmed.match(
        /\b(the|this|that|there|according|because|however|catalog|assistant|previously|discrepancy)\b/gi,
      ) ?? []
    ).length;
    if (englishHits >= 6 && spanishMarks === 0 && trimmed.length > 180) {
      return true;
    }

    return false;
  }

  private isHandoff(content: string): boolean {
    const normalized = content.trim();
    return (
      normalized === HANDOFF_MARKER ||
      normalized.toUpperCase().includes(HANDOFF_MARKER) ||
      /^\[?\s*handoff\s*\]?$/i.test(normalized)
    );
  }
}
