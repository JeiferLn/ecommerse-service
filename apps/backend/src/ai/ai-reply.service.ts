import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env.validation";
import { PrismaService } from "../prisma/prisma.service";
import { AiProviderFactory } from "./ai-provider.factory";
import { CatalogContextService } from "./catalog-context.service";
import { HANDOFF_MARKER, type ChatMessage } from "./ai.types";
import { formatCommercePromptBlock } from "./commerce-prompt";
import { buildSalesAssistantSystemPrompt } from "./prompts/sales-assistant";
import {
  buildSalesScopeRedirect,
  isClearlyOffTopicSalesQuery,
  looksLikeOffTopicAssistantReply,
} from "./sales-scope";
import {
  KnowledgeRetrievalService,
  type RetrievedChunk,
} from "../knowledge/knowledge-retrieval.service";

export interface GenerateReplyInput {
  companyId: string;
  conversationId: string;
  customerText: string;
}

export interface GenerateReplyResult {
  text: string;
  requestedHandoff: boolean;
  /** URLs públicas de imágenes a enviar por WhatsApp ( Twilio MediaUrl ). */
  imageUrls: string[];
}

@Injectable()
export class AiReplyService {
  private readonly logger = new Logger(AiReplyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly providerFactory: AiProviderFactory,
    private readonly catalogContext: CatalogContextService,
    private readonly knowledgeRetrieval: KnowledgeRetrievalService,
  ) {}

  async generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult> {
    const fallback = this.config.get("AI_FALLBACK_TEXT", { infer: true });
    let ragBlock = "";
    let ragChunks: RetrievedChunk[] = [];
    let imageUrls: string[] = [];

    try {
      const historyLimit = this.config.get("AI_HISTORY_LIMIT", { infer: true });
      const recent = await this.prisma.message.findMany({
        where: { conversationId: input.conversationId },
        orderBy: { createdAt: "desc" },
        take: historyLimit,
        select: { direction: true, body: true },
      });

      // Follow-ups ("¿qué precio?", "muéstramelas") necesitan contexto del producto ya mencionado.
      const priorInbound = recent
        .filter((message) => message.direction === "inbound")
        .map((message) => message.body)
        .reverse()
        .join(" ");
      const catalogQuery = `${priorInbound} ${input.customerText}`.trim();

      const catalog = await this.catalogContext.buildForCompany(
        input.companyId,
        catalogQuery,
      );

      if (isClearlyOffTopicSalesQuery(input.customerText)) {
        this.logger.log(
          `Off-topic sales query blocked conversation=${input.conversationId}`,
        );
        return {
          text: buildSalesScopeRedirect(catalog.companyName),
          requestedHandoff: false,
          imageUrls: [],
        };
      }

      const productFocused = this.isProductFocusedQuery(input.customerText);
      if (!productFocused) {
        const retrieved = await this.knowledgeRetrieval.retrieve(
          input.companyId,
          input.customerText,
        );
        ragBlock = retrieved.ragBlock;
        ragChunks = retrieved.chunks;
      }

      // Sin catálogo ni documentos: no hay con qué responder.
      if (catalog.productCount === 0 && ragChunks.length === 0) {
        return { text: fallback, requestedHandoff: true, imageUrls: [] };
      }

      if (this.wantsProductImages(input.customerText) || productFocused) {
        imageUrls = catalog.matchedProducts
          .flatMap((product) => product.imageUrls)
          .slice(0, 3);
      }

      const companyCommerce = await this.prisma.company.findUnique({
        where: { id: input.companyId },
        select: {
          countryCode: true,
          shippingRegion: true,
          shippingCity: true,
          shippingScopes: true,
          shippingCarriers: true,
        },
      });
      const commerce = formatCommercePromptBlock(
        companyCommerce ?? {
          countryCode: null,
          shippingRegion: null,
          shippingCity: null,
          shippingScopes: [],
          shippingCarriers: [],
        },
      );

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
            ragBlock,
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

      if (this.isHandoff(content)) {
        this.logger.warn(`AI handoff marker for conversation=${input.conversationId}`);
        return { text: fallback, requestedHandoff: true, imageUrls: [] };
      }

      if (!content || this.looksLikeInternalReasoning(content)) {
        this.logger.warn(
          `AI empty/garbage reply for conversation=${input.conversationId}; using RAG/catalog fallback`,
        );
        const catalogFallback = this.buildCatalogOverviewFallback(
          catalog.catalogBlock,
          input.customerText,
        );
        return {
          text:
            (productFocused ? catalogFallback : null) ??
            this.buildKnowledgeFallback(ragChunks) ??
            catalogFallback ??
            fallback,
          requestedHandoff: false,
          imageUrls,
        };
      }

      if (looksLikeOffTopicAssistantReply(content)) {
        this.logger.warn(
          `AI off-topic tutorial blocked conversation=${input.conversationId}`,
        );
        return {
          text: buildSalesScopeRedirect(catalog.companyName),
          requestedHandoff: false,
          imageUrls: [],
        };
      }

      let text = content.replace(HANDOFF_MARKER, "").trim() || fallback;
      if (this.wantsProductImages(input.customerText) && imageUrls.length > 0) {
        text = `${text}\n\nTe envío ${imageUrls.length === 1 ? "la foto" : "las fotos"} del producto.`;
      } else if (this.wantsProductImages(input.customerText) && imageUrls.length === 0) {
        text = `${text}\n\nPor ahora no tengo fotos cargadas de ese producto en el catálogo.`;
      }

      return {
        text,
        requestedHandoff: false,
        imageUrls: this.wantsProductImages(input.customerText) ? imageUrls : [],
      };
    } catch (error) {
      this.logger.error(`AI reply failed: ${String(error)}`);
      // Si el modelo falló pero ya teníamos documentos, responde con ellos.
      if (ragChunks.length === 0 && !this.isProductFocusedQuery(input.customerText)) {
        try {
          const recovered = await this.knowledgeRetrieval.retrieve(
            input.companyId,
            input.customerText,
          );
          ragChunks = recovered.chunks;
        } catch {
          // ignore
        }
      }
      return {
        text: this.buildKnowledgeFallback(ragChunks) ?? fallback,
        requestedHandoff: false,
        imageUrls: [],
      };
    }
  }

  /** Preguntas de producto (precio/talla/foto): priorizar catálogo, no FAQ. */
  private isProductFocusedQuery(text: string): boolean {
    const normalized = text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return /(precio|cuanto|cuesta|talla|tallas|color|colores|stock|disponible|mostrar|muestra|muestrame|foto|fotos|imagen|imagenes|variante|sku|producto|gorra|gorras|camisa|pantalon)/.test(
      normalized,
    );
  }

  private wantsProductImages(text: string): boolean {
    const normalized = text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return /(mostrar|muestra|muestrame|ensename|enseñame|foto|fotos|imagen|imagenes|verlas|verlo|verla|puedes\s+mostrar)/.test(
      normalized,
    );
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

  /** Si el modelo falla pero hay RAG, resume el fragmento más relevante. */
  private buildKnowledgeFallback(chunks: RetrievedChunk[]): string | null {
    const best = chunks[0];
    if (!best?.content?.trim()) {
      return null;
    }

    const cleaned = best.content
      .replace(/^#+\s*/gm, "")
      .replace(/\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const snippet = cleaned.length > 280 ? `${cleaned.slice(0, 277).trim()}…` : cleaned;
    return `Según nuestra información de "${best.documentTitle}": ${snippet}`;
  }

  /** Si el modelo falla en una pregunta de catálogo, lista 2-3 nombres del bloque. */
  private buildCatalogOverviewFallback(
    catalogBlock: string,
    customerText: string,
  ): string | null {
    const normalized = customerText
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const overviewAsk =
      /(que venden|que tienen|que articulos|que productos|catalogo|en stock|disponibles|que hay)/.test(
        normalized,
      );
    if (!overviewAsk) {
      return null;
    }

    const names = [...catalogBlock.matchAll(/^- (.+?)(?:\s\[|\s—|\s\|)/gm)]
      .map((match) => match[1]?.trim())
      .filter((name): name is string => Boolean(name))
      .slice(0, 3);

    if (names.length === 0) {
      return null;
    }

    return `Ahora mismo tenemos: ${names.join(", ")}. ¿Quieres precio o más detalles de alguno?`;
  }
}
