import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CartView, MessageInteractive } from "@commerce-ai/types";
import type { Prisma } from "@prisma/client";

import type { Env } from "../config/env.validation";
import { BillingService } from "../billing/billing.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { AiReplyService, type GenerateReplyResult } from "../ai/ai-reply.service";
import {
  resolveOrderChatIntent,
  detectsAffirmativeCartConfirm,
  botOfferedAddToCart,
} from "../orders/order-intent";
import { OrdersService } from "../orders/orders.service";
import {
  detectsBotChoice,
  detectsHumanRequest,
  extractResidualAfterBotChoice,
} from "./conversation-handler";
import {
  addConfirmButtons,
  cartActionButtons,
  checkoutLinkButton,
  handlerChoiceButtons,
  parseActionId,
  type ParsedAction,
  productCardInteractive,
  productListInteractive,
  renderAsFallbackText,
  resolveTypedAction,
} from "./interactive-message.util";
import { parseInteractive } from "./message-dto.util";
import { normalizeWhatsAppE164 } from "./phone.util";
import { extractStoreCode } from "./store-code.util";
import { TwilioContentService } from "./twilio-content.service";
import { type SendTextResult, TwilioWhatsAppClient } from "./twilio-whatsapp.client";
import { WhatsAppConnectionService } from "./whatsapp-connection.service";

export interface InboundMessageInput {
  /** Número Twilio al que escribió el cliente (E.164): el propio de una tienda o el compartido. */
  twilioWhatsAppNumber: string;
  from: string;
  text: string;
  /** Id del botón u opción que tocó el cliente (ButtonPayload / ListId). */
  actionId?: string | null;
  customerName?: string | null;
  wamid?: string | null;
  rawPayload?: Prisma.InputJsonValue;
}

/** Mensaje que arma el bot: texto y, si aplica, botones, lista, tarjeta o enlace. */
interface OutboundMessage {
  text: string;
  interactive?: MessageInteractive | null;
  /** Texto para WhatsApp si lo interactivo no se puede enviar; por defecto `renderAsFallbackText`. */
  fallbackText?: string;
}

/** Canal de respuesta. Sin número Twilio = "Prueba tu asistente": no se envía nada fuera. */
interface ReplyChannel {
  companyId: string;
  twilioWhatsAppNumber: string | null;
}

interface ResolvedInbound {
  connection: {
    id: string;
    companyId: string;
    twilioWhatsAppNumber: string;
    isActive: boolean;
  };
  /** Texto del cliente sin el `#codigo` de la tienda. */
  text: string;
  /** "Estás hablando con …" cuando el cliente entra a una tienda por el número compartido. */
  storeGreeting: string | null;
}

export const SHARED_NUMBER_UNROUTED_TEXT =
  "Hola, este es el WhatsApp de Commerce AI. Para hablar con una tienda, abre el enlace que te compartió.";

export const HANDLER_CHOICE_BUTTONS_TEXT = "¡Hola! ¿Quién prefieres que te atienda?";
const CONTINUE_SHOPPING_TEXT = "¡Claro! Elige otro producto de la lista o cuéntame qué buscas.";
const ADD_DECLINED_TEXT = "Perfecto. ¿Te ayudo con algo más?";
/** Por encima, el texto va en un mensaje aparte y los botones con un cuerpo corto (WhatsApp: 1024). */
const INTERACTIVE_BODY_MAX = 1000;

export const PLAYGROUND_CHECKOUT_TEXT =
  "Modo prueba: aquí tu cliente recibiría el enlace de pago de Mercado Pago para confirmar el pedido. En la prueba no se crea el pedido ni se descuenta stock.";

@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly twilioClient: TwilioWhatsAppClient,
    private readonly contentService: TwilioContentService,
    private readonly storage: StorageService,
    private readonly aiReplyService: AiReplyService,
    private readonly connectionService: WhatsAppConnectionService,
    private readonly ordersService: OrdersService,
    private readonly billing: BillingService,
  ) {}

  /**
   * Valida X-Twilio-Signature. Requiere TWILIO_WEBHOOK_URL (URL pública exacta)
   * salvo TWILIO_SKIP_SIGNATURE en non-production.
   */
  assertTwilioSignature(signatureHeader: string | undefined, params: Record<string, string>): void {
    const skip = this.config.get("TWILIO_SKIP_SIGNATURE", { infer: true });
    const nodeEnv = this.config.get("NODE_ENV", { infer: true });

    if (skip && nodeEnv !== "production") {
      return;
    }

    const authToken = this.config.get("TWILIO_AUTH_TOKEN", { infer: true })?.trim();
    const webhookUrl = this.config.get("TWILIO_WEBHOOK_URL", { infer: true })?.trim();

    if (!authToken) {
      throw new UnauthorizedException("TWILIO_AUTH_TOKEN no configurado");
    }
    if (!webhookUrl) {
      throw new UnauthorizedException("TWILIO_WEBHOOK_URL no configurado");
    }
    if (!signatureHeader) {
      throw new UnauthorizedException("Firma de webhook Twilio ausente");
    }

    const data = Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], webhookUrl);
    const expected = createHmac("sha1", authToken)
      .update(Buffer.from(data, "utf8"))
      .digest("base64");

    const expectedBuf = Buffer.from(expected, "utf8");
    const providedBuf = Buffer.from(signatureHeader, "utf8");
    if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
      throw new UnauthorizedException("Firma de webhook Twilio inválida");
    }
  }

  async handleTwilioWebhook(params: Record<string, string>): Promise<{ processed: number }> {
    const messageSid = params.MessageSid || params.SmsSid || null;
    const status = params.MessageStatus || params.SmsStatus;

    // Status callback (sin Body): actualizar mensaje existente.
    if (status && messageSid && !params.Body) {
      await this.applyStatus(messageSid, status);
      return { processed: 0 };
    }

    const fromRaw = params.From;
    const toRaw = params.To;
    // Botón (quick-reply) o lista: Twilio manda el título en Body y el id en ButtonPayload / ListId.
    const actionId = params.ButtonPayload?.trim() || params.ListId?.trim() || null;
    const body = (params.Body || params.ButtonText || params.ListTitle)?.trim();

    if (!fromRaw || !toRaw || !body) {
      // Puede ser un evento que no nos interesa.
      return { processed: 0 };
    }

    const twilioWhatsAppNumber = normalizeWhatsAppE164(toRaw);
    const from = normalizeWhatsAppE164(fromRaw);
    if (!twilioWhatsAppNumber || !from) {
      this.logger.warn(`Twilio webhook con números inválidos To=${toRaw} From=${fromRaw}`);
      return { processed: 0 };
    }

    try {
      await this.ingestInbound({
        twilioWhatsAppNumber,
        from,
        text: body,
        actionId,
        customerName: params.ProfileName?.trim() || null,
        wamid: messageSid,
        rawPayload: params,
      });
    } catch (error) {
      // Twilio reintenta 4xx/5xx; si falta comercio o conexión, acusamos recibo sin procesar.
      this.logger.warn(`Twilio inbound no procesado: ${String(error)}`);
      return { processed: 0 };
    }

    return { processed: 1 };
  }

  async simulateInbound(
    companyId: string | null,
    input: { from: string; text: string; customerName?: string },
  ): Promise<{ conversationId: string; messageId: string }> {
    this.assertDevelopmentOnly();
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }

    await this.connectionService.assertCommerceConfigured(companyId);

    const connection = await this.prisma.whatsAppConnection.findUnique({
      where: { companyId },
    });
    if (!connection || !connection.isActive) {
      throw new BadRequestException("Configura una conexión WhatsApp activa primero");
    }

    const from = normalizeWhatsAppE164(input.from);
    if (!from) {
      throw new BadRequestException("Número del cliente inválido (usa E.164, ej. +573001112233)");
    }

    const text = input.text.trim();
    return this.ingestForConnection(
      { connection, text, storeGreeting: null },
      {
        twilioWhatsAppNumber: connection.twilioWhatsAppNumber,
        from,
        text,
        customerName: input.customerName?.trim() || null,
        wamid: `SM_sim_in_${Date.now()}`,
        rawPayload: { simulated: true, from: input.from, text: input.text },
      },
    );
  }

  /** Herramientas de desarrollo que no deben existir en producción. */
  assertDevelopmentOnly(): void {
    if (this.config.get("NODE_ENV", { infer: true }) === "production") {
      throw new ForbiddenException("No disponible en producción");
    }
  }

  /** Responde a un mensaje de "Prueba tu asistente" sin enviar nada por WhatsApp. */
  async replyInPlayground(
    companyId: string,
    conversationId: string,
    customerText: string,
    actionId: string | null = null,
  ): Promise<void> {
    await this.maybeAutoReply(
      { companyId, twilioWhatsAppNumber: null },
      conversationId,
      "",
      customerText,
      null,
      actionId,
    );
  }

  /**
   * Resuelve la tienda de un mensaje entrante y lo procesa.
   * En el número compartido, sin código ni sesión, responde cómo llegar a una tienda y no crea conversación.
   */
  async ingestInbound(input: InboundMessageInput): Promise<{
    conversationId: string;
    messageId: string;
  } | null> {
    const resolved = await this.resolveInboundConnection(
      input.twilioWhatsAppNumber,
      input.from,
      input.text,
    );
    if (!resolved) {
      if (input.twilioWhatsAppNumber === this.connectionService.getSharedNumber()) {
        await this.replyUnroutedSharedMessage(input.twilioWhatsAppNumber, input.from);
        return null;
      }
      this.logger.warn(
        `No active WhatsApp connection for twilioWhatsAppNumber=${input.twilioWhatsAppNumber}`,
      );
      throw new BadRequestException("Conexión WhatsApp no encontrada o inactiva");
    }
    return this.ingestForConnection(resolved, input);
  }

  /**
   * Número propio → su tienda. Número compartido → tienda del `#codigo` del mensaje
   * (y se recuerda para ese cliente) o, sin código, la tienda de su sesión.
   */
  private async resolveInboundConnection(
    to: string,
    from: string,
    text: string,
  ): Promise<ResolvedInbound | null> {
    const dedicated = await this.prisma.whatsAppConnection.findFirst({
      where: { twilioWhatsAppNumber: to, mode: "dedicated" },
    });
    if (dedicated) {
      return { connection: dedicated, text, storeGreeting: null };
    }

    const sharedNumber = this.connectionService.getSharedNumber();
    if (!sharedNumber || sharedNumber !== to) {
      return null;
    }

    const { code, rest } = extractStoreCode(text);
    if (code) {
      const target = await this.prisma.whatsAppConnection.findFirst({
        where: { storeCode: code, mode: "shared" },
        include: { company: { select: { name: true } } },
      });
      if (target) {
        const previous = await this.prisma.sharedNumberSession.findUnique({
          where: { customerWaId: from },
          select: { connectionId: true },
        });
        await this.prisma.sharedNumberSession.upsert({
          where: { customerWaId: from },
          create: { customerWaId: from, connectionId: target.id },
          update: { connectionId: target.id },
        });
        return {
          connection: target,
          text: rest || text,
          storeGreeting:
            previous?.connectionId === target.id
              ? null
              : `Estás hablando con *${target.company.name}*.`,
        };
      }
    }

    const session = await this.prisma.sharedNumberSession.findUnique({
      where: { customerWaId: from },
      include: { connection: true },
    });
    if (session && session.connection.mode === "shared") {
      return { connection: session.connection, text, storeGreeting: null };
    }
    return null;
  }

  private async replyUnroutedSharedMessage(
    sharedNumber: string,
    customerWaId: string,
  ): Promise<void> {
    try {
      await this.twilioClient.sendText({
        from: sharedNumber,
        to: customerWaId,
        text: SHARED_NUMBER_UNROUTED_TEXT,
      });
    } catch (error) {
      this.logger.error(`Respuesta del número compartido falló: ${String(error)}`);
    }
  }

  private async ingestForConnection(
    resolved: ResolvedInbound,
    input: InboundMessageInput,
  ): Promise<{ conversationId: string; messageId: string }> {
    const { connection } = resolved;
    const text = resolved.text;

    if (!connection.isActive) {
      this.logger.warn(
        `No active WhatsApp connection for twilioWhatsAppNumber=${input.twilioWhatsAppNumber}`,
      );
      throw new BadRequestException("Conexión WhatsApp no encontrada o inactiva");
    }

    try {
      await this.connectionService.assertCommerceConfigured(connection.companyId);
    } catch {
      this.logger.warn(`Inbound ignorado: empresa ${connection.companyId} sin envíos configurados`);
      throw new BadRequestException(
        "Configura envíos (país, cobertura y transportadoras) en Configuración antes de usar WhatsApp. Solo el dueño de la empresa puede hacerlo.",
      );
    }

    const now = new Date();
    const conversation = await this.prisma.conversation.upsert({
      where: {
        waConnectionId_customerWaId: {
          waConnectionId: connection.id,
          customerWaId: input.from,
        },
      },
      create: {
        companyId: connection.companyId,
        waConnectionId: connection.id,
        customerWaId: input.from,
        customerName: input.customerName ?? null,
        handler: "pending",
        lastMessageAt: now,
      },
      update: {
        lastMessageAt: now,
        ...(input.customerName ? { customerName: input.customerName } : {}),
      },
    });

    const inbound = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "inbound",
        wamid: input.wamid ?? null,
        type: "text",
        body: text,
        status: "received",
        interactive: input.actionId ? { kind: "reply", actionId: input.actionId } : undefined,
        rawPayload: input.rawPayload ?? undefined,
      },
    });

    await this.maybeAutoReply(
      connection,
      conversation.id,
      input.from,
      text,
      resolved.storeGreeting,
      input.actionId ?? null,
    );

    return { conversationId: conversation.id, messageId: inbound.id };
  }

  private async applyStatus(messageSid: string, status: string): Promise<void> {
    const mapped =
      status === "failed" || status === "undelivered"
        ? "failed"
        : status === "sent" ||
            status === "delivered" ||
            status === "read" ||
            status === "queued" ||
            status === "sending" ||
            status === "received"
          ? "sent"
          : null;
    if (!mapped) {
      return;
    }
    await this.prisma.message.updateMany({
      where: { wamid: messageSid },
      data: { status: mapped },
    });
  }

  private async maybeAutoReply(
    connection: ReplyChannel,
    conversationId: string,
    customerWaId: string,
    customerText: string,
    storeGreeting: string | null = null,
    actionId: string | null = null,
  ): Promise<void> {
    const playground = connection.twilioWhatsAppNumber === null;
    const enabled = this.config.get("WHATSAPP_AUTO_REPLY_ENABLED", { infer: true });
    if (!enabled && !playground) {
      return;
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { handler: true },
    });
    if (!conversation) {
      return;
    }

    const action = await this.resolveAction(conversationId, customerText, actionId);
    const choseBot = action?.type === "handler_bot" || (!action && detectsBotChoice(customerText));
    const choseHuman =
      action?.type === "handler_human" || (!action && detectsHumanRequest(customerText));

    if (conversation.handler === "human" && !choseBot) {
      if (storeGreeting) {
        await this.sendOutbound({
          connection,
          conversationId,
          customerWaId,
          message: { text: storeGreeting },
        });
      }
      return;
    }

    const outbound: OutboundMessage[] = [];
    const outboundImageUrls: string[] = [];
    let nextHandler: "pending" | "bot" | "human" | null = null;
    const aiEnabled = this.config.get("AI_ENABLED", { infer: true });
    const botConfirm = this.config.get("WHATSAPP_HANDLER_BOT_CONFIRM_TEXT", { infer: true });
    const humanConfirm = this.config.get("WHATSAPP_HANDLER_HUMAN_CONFIRM_TEXT", { infer: true });

    const pushBotFollowUp = async () => {
      const followUp = await this.buildBotFollowUpAfterChoice({
        connection,
        conversationId,
        customerText: action ? "" : customerText,
        aiEnabled,
      });
      if (!followUp) {
        return;
      }
      if (followUp.requestedHandoff) {
        nextHandler = "human";
        outbound.push({ text: humanConfirm });
      } else {
        await this.appendAiReply(outbound, outboundImageUrls, followUp, connection.companyId);
      }
    };

    if (conversation.handler === "human") {
      nextHandler = "bot";
      outbound.push({ text: botConfirm });
      await pushBotFollowUp();
    } else if (conversation.handler === "pending") {
      if (choseHuman) {
        nextHandler = "human";
        outbound.push({ text: humanConfirm });
      } else if (choseBot) {
        nextHandler = "bot";
        outbound.push({ text: botConfirm });
        await pushBotFollowUp();
      } else {
        outbound.push({
          text: HANDLER_CHOICE_BUTTONS_TEXT,
          interactive: handlerChoiceButtons(),
          fallbackText: this.config.get("WHATSAPP_HANDLER_CHOICE_TEXT", { infer: true }),
        });
      }
    } else if (conversation.handler === "bot") {
      if (choseHuman) {
        nextHandler = "human";
        outbound.push({ text: humanConfirm });
      } else {
        const waQuota = playground
          ? { allowed: true }
          : await this.billing.recordWaInbound(connection.companyId);
        if (!waQuota.allowed) {
          outbound.push({
            text: "El negocio no puede atender por bot en este momento. Un asesor te contactará pronto.",
          });
        } else {
          const commerceReply = action
            ? await this.handleAction(
                action,
                connection.companyId,
                conversationId,
                customerText,
                playground,
              )
            : await this.tryHandleOrderIntent(
                connection.companyId,
                conversationId,
                customerText,
                playground,
              );
          if (commerceReply) {
            outbound.push(...commerceReply);
          } else if (aiEnabled) {
            const aiQuota = await this.billing.recordAiReply(connection.companyId);
            if (!aiQuota.allowed) {
              outbound.push({ text: this.config.get("WHATSAPP_AUTO_REPLY_TEXT", { infer: true }) });
            } else {
              const reply = await this.aiReplyService.generateReply({
                companyId: connection.companyId,
                conversationId,
                customerText,
              });
              if (reply.requestedHandoff) {
                nextHandler = "human";
                outbound.push({ text: humanConfirm });
              } else {
                await this.appendAiReply(outbound, outboundImageUrls, reply, connection.companyId);
              }
            }
          } else {
            outbound.push({ text: this.config.get("WHATSAPP_AUTO_REPLY_TEXT", { infer: true }) });
          }
        }
      }
    }

    if (storeGreeting) {
      const first = outbound[0];
      if (first) {
        first.text = `${storeGreeting}\n\n${first.text}`;
        if (first.fallbackText) {
          first.fallbackText = `${storeGreeting}\n\n${first.fallbackText}`;
        }
      } else {
        outbound.push({ text: storeGreeting });
      }
    }

    if (outbound.length === 0 && outboundImageUrls.length === 0) {
      return;
    }

    if (nextHandler) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { handler: nextHandler },
      });
    }

    for (const message of outbound) {
      await this.sendOutbound({ connection, conversationId, customerWaId, message });
    }

    for (const mediaUrl of outboundImageUrls.slice(0, 3)) {
      await this.sendOutboundMedia({
        connection,
        conversationId,
        customerWaId,
        mediaUrl,
      });
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });
  }

  /** Acción del botón tocado; o, si escribió "2" o el título de una opción, la de esa opción. */
  private async resolveAction(
    conversationId: string,
    customerText: string,
    actionId: string | null,
  ): Promise<ParsedAction | null> {
    const direct = parseActionId(actionId);
    if (direct || customerText.length > 40) {
      return direct;
    }
    const lastBot = await this.prisma.message.findFirst({
      where: { conversationId, direction: "outbound" },
      orderBy: { createdAt: "desc" },
      select: { interactive: true },
    });
    return parseActionId(resolveTypedAction(customerText, parseInteractive(lastBot?.interactive)));
  }

  /** Respuesta determinista a un botón u opción del bot. */
  private async handleAction(
    action: ParsedAction,
    companyId: string,
    conversationId: string,
    customerText: string,
    playground: boolean,
  ): Promise<OutboundMessage[] | null> {
    try {
      switch (action.type) {
        case "handler_bot":
          return [{ text: this.config.get("WHATSAPP_HANDLER_BOT_CONFIRM_TEXT", { infer: true }) }];
        case "handler_human":
          return null;
        case "cart_view": {
          const cart = await this.ordersService.getCartForConversation(companyId, conversationId);
          return [this.cartOutbound(cart)];
        }
        case "cart_clear": {
          const cleared = await this.ordersService.clearCart(companyId, conversationId);
          return [this.cartOutbound(cleared)];
        }
        case "cart_checkout": {
          const cart = await this.ordersService.getCartForConversation(companyId, conversationId);
          return [await this.checkoutOutbound(companyId, conversationId, cart, playground)];
        }
        case "cart_continue": {
          const products = await this.ordersService.getSuggestedProducts(companyId);
          const list = productListInteractive(products);
          return [
            list
              ? { text: CONTINUE_SHOPPING_TEXT, interactive: list }
              : { text: "¡Claro! Cuéntame qué producto buscas." },
          ];
        }
        case "add_yes":
          return (
            (await this.tryHandleOrderIntent(companyId, conversationId, customerText, playground, {
              type: "add_to_cart",
            })) ?? [{ text: "No identifiqué qué producto agregar. ¿Cuál quieres?" }]
          );
        case "add_no":
          return [{ text: ADD_DECLINED_TEXT }];
        case "variant": {
          const updated = await this.ordersService.addCartItem(
            companyId,
            conversationId,
            action.variantId,
            1,
          );
          const item = updated.items.find((entry) => entry.variantId === action.variantId);
          const label = item ? `${item.productName} (${item.variantName})` : "el producto";
          return [this.cartOutbound(updated, `Agregué ${label} x1.`)];
        }
        case "product": {
          const [product] = await this.ordersService.getSuggestedProducts(companyId, {
            productIds: [action.productId],
          });
          const list = product ? productListInteractive([product], "Ver opciones") : null;
          return [
            product && list
              ? { text: `Elige la opción de ${product.name} que quieres:`, interactive: list }
              : { text: "Ese producto ya no está disponible. ¿Te muestro otros?" },
          ];
        }
      }
    } catch (error) {
      this.logger.warn(`Interactive action failed: ${String(error)}`);
      return [{ text: this.orderErrorMessage(error) }];
    }
  }

  /** Respuesta de la IA + tarjeta (1 producto), lista (varios) o "¿lo agrego?". */
  private async appendAiReply(
    outbound: OutboundMessage[],
    imageUrls: string[],
    reply: GenerateReplyResult,
    companyId: string,
  ): Promise<void> {
    let interactive: MessageInteractive | null = null;
    const ids = reply.suggestedProductIds ?? [];
    if (ids.length > 0) {
      try {
        const products = await this.ordersService.getSuggestedProducts(companyId, {
          productIds: ids,
        });
        interactive =
          products.length === 1 && products[0]
            ? productCardInteractive(products[0])
            : productListInteractive(products);
      } catch (error) {
        this.logger.warn(`Suggested products failed: ${String(error)}`);
      }
    }
    if (!interactive && botOfferedAddToCart(reply.text)) {
      interactive = addConfirmButtons();
    }
    outbound.push({ text: reply.text, interactive });
    if (interactive?.kind !== "product_card") {
      imageUrls.push(...(reply.imageUrls ?? []));
    }
  }

  private cartOutbound(cart: CartView, prefix?: string): OutboundMessage {
    const join = (cartText: string) => [prefix, cartText].filter(Boolean).join("\n\n");
    if (cart.items.length === 0) {
      return { text: join(this.ordersService.formatCartMessage(cart)) };
    }
    return {
      text: join(this.ordersService.formatCartMessage(cart, { withInstructions: false })),
      interactive: cartActionButtons(),
    };
  }

  private async checkoutOutbound(
    companyId: string,
    conversationId: string,
    cart: CartView,
    playground: boolean,
  ): Promise<OutboundMessage> {
    if (playground) {
      return {
        text: `${PLAYGROUND_CHECKOUT_TEXT}\n\n${this.ordersService.formatCartMessage(cart, { withInstructions: false })}`,
        interactive: cart.items.length > 0 ? checkoutLinkButton(null) : null,
      };
    }
    const result = await this.ordersService.beginCheckout(companyId, conversationId);
    return result.checkoutUrl
      ? {
          text: result.summary,
          interactive: checkoutLinkButton(result.checkoutUrl),
          fallbackText: result.message,
        }
      : { text: result.message };
  }

  private orderErrorMessage(error: unknown): string {
    const message =
      error instanceof BadRequestException
        ? String((error.getResponse() as { message?: string | string[] }).message ?? error.message)
        : "No pude actualizar el carrito. Intenta de nuevo o pide un asesor.";
    return Array.isArray(message) ? message.join(" ") : message;
  }

  private async tryHandleOrderIntent(
    companyId: string,
    conversationId: string,
    customerText: string,
    playground = false,
    forcedIntent: { type: "add_to_cart" } | null = null,
  ): Promise<OutboundMessage[] | null> {
    try {
      const cart = await this.ordersService.getCartForConversation(companyId, conversationId);
      let intent = forcedIntent ?? resolveOrderChatIntent(customerText);

      // "sí / dale" tras oferta del bot de agregar → tratar como add_to_cart.
      if (!intent && detectsAffirmativeCartConfirm(customerText)) {
        const lastBot = await this.prisma.message.findFirst({
          where: { conversationId, direction: "outbound" },
          orderBy: { createdAt: "desc" },
          select: { body: true },
        });
        if (lastBot?.body && botOfferedAddToCart(lastBot.body)) {
          intent = { type: "add_to_cart" };
        }
      }

      if (!intent) {
        return null;
      }

      if (intent.type === "view_cart") {
        return [this.cartOutbound(cart)];
      }

      if (intent.type === "clear_cart") {
        const cleared = await this.ordersService.clearCart(companyId, conversationId);
        return [this.cartOutbound(cleared)];
      }

      if (intent.type === "checkout") {
        return [await this.checkoutOutbound(companyId, conversationId, cart, playground)];
      }

      if (intent.type === "add_to_cart") {
        let match = await this.ordersService.findVariantForAddIntent(companyId, customerText);
        if (!match) {
          // Frases como "me gustaría pedir una" / "sí" / "quiero 2": usar historial + oferta del bot.
          const recent = await this.prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: "desc" },
            take: 10,
            select: { body: true, direction: true },
          });
          const historyQuery = [
            ...recent
              .map((m) => m.body.trim())
              .filter(Boolean)
              .reverse(),
            customerText,
          ].join(" ");
          match = await this.ordersService.findVariantForAddIntent(companyId, historyQuery);
        }
        if (!match) {
          // Sin producto claro → IA responde; no FAQ por defecto.
          return null;
        }
        const updated = await this.ordersService.addCartItem(
          companyId,
          conversationId,
          match.variantId,
          match.quantity,
        );
        return [this.cartOutbound(updated, `Agregué ${match.label} x${match.quantity}.`)];
      }

      return null;
    } catch (error) {
      this.logger.warn(`Order intent failed: ${String(error)}`);
      return [{ text: this.orderErrorMessage(error) }];
    }
  }

  /**
   * Si el cliente eligió bot tras (o junto a) una pregunta real,
   * genera la respuesta para enviarla como 2º mensaje.
   */
  private async buildBotFollowUpAfterChoice(params: {
    connection: { companyId: string };
    conversationId: string;
    customerText: string;
    aiEnabled: boolean;
  }): Promise<GenerateReplyResult | null> {
    if (!params.aiEnabled) {
      return null;
    }

    const pendingQuestion = await this.findQuestionForBotFollowUp(
      params.conversationId,
      params.customerText,
    );
    if (!pendingQuestion) {
      return null;
    }

    return this.aiReplyService.generateReply({
      companyId: params.connection.companyId,
      conversationId: params.conversationId,
      customerText: pendingQuestion,
    });
  }

  /** Pregunta del mismo mensaje (bot + pregunta) o del inbound previo. */
  private async findQuestionForBotFollowUp(
    conversationId: string,
    customerText: string,
  ): Promise<string | null> {
    const fromCurrent = extractResidualAfterBotChoice(customerText);
    if (fromCurrent && !this.isOnlyGreeting(fromCurrent)) {
      return fromCurrent;
    }

    return this.findPriorCustomerQuestion(conversationId);
  }

  /** Último inbound con intención real, ignorando elecciones bot/asesor y saludos sueltos. */
  private async findPriorCustomerQuestion(conversationId: string): Promise<string | null> {
    const recent = await this.prisma.message.findMany({
      where: { conversationId, direction: "inbound" },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { body: true, interactive: true },
    });

    for (const message of recent) {
      const body = message.body.trim();
      if (!body || parseInteractive(message.interactive)?.kind === "reply") {
        continue;
      }
      if (detectsHumanRequest(body)) {
        continue;
      }
      if (detectsBotChoice(body)) {
        const residual = extractResidualAfterBotChoice(body);
        if (residual && !this.isOnlyGreeting(residual)) {
          return residual;
        }
        continue;
      }
      if (this.isOnlyGreeting(body)) {
        continue;
      }
      return body;
    }

    return null;
  }

  private isOnlyGreeting(text: string): boolean {
    const normalized = text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    const greetingOnly =
      /^(hola|buenas|buenos\s+dias|buenas\s+tardes|buenas\s+noches|hey|saludos|que\s+tal|hi|hello)[!?.\s]*$/i.test(
        normalized,
      );
    return greetingOnly;
  }

  /** Guarda el mensaje tal como lo ve el cliente y, fuera del playground, lo envía por WhatsApp. */
  private async sendOutbound(params: {
    connection: { twilioWhatsAppNumber: string | null };
    conversationId: string;
    customerWaId: string;
    message: OutboundMessage;
  }): Promise<void> {
    const interactive = params.message.interactive ?? null;
    let sendResult: SendTextResult = { simulated: true, wamid: null };
    let status: "sent" | "failed" = "sent";

    if (params.connection.twilioWhatsAppNumber) {
      try {
        sendResult = await this.deliverToWhatsApp(
          params.connection.twilioWhatsAppNumber,
          params.customerWaId,
          params.message,
        );
      } catch (error) {
        this.logger.error(`Auto-reply failed: ${String(error)}`);
        sendResult = { simulated: false, wamid: null };
        status = "failed";
      }
    }

    await this.prisma.message.create({
      data: {
        conversationId: params.conversationId,
        direction: "outbound",
        wamid: sendResult.wamid,
        type: interactive ? "interactive" : "text",
        body: params.message.text,
        status,
        interactive: interactive ? (interactive as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  /**
   * Interactivo vía Twilio Content API; si está desactivado, no aplica o Twilio falla,
   * el mismo mensaje sale como texto con las opciones numeradas.
   */
  private async deliverToWhatsApp(
    from: string,
    to: string,
    message: OutboundMessage,
  ): Promise<SendTextResult> {
    const interactive = message.interactive ?? null;
    if (!interactive) {
      return this.twilioClient.sendText({ from, to, text: message.text });
    }
    const fallback = message.fallbackText ?? renderAsFallbackText(message.text, interactive);
    if (!this.config.get("WHATSAPP_INTERACTIVE_ENABLED", { infer: true })) {
      return this.twilioClient.sendText({ from, to, text: fallback });
    }

    try {
      let body = message.text;
      if (interactive.kind === "product_card") {
        if (interactive.imageUrl) {
          await this.twilioClient.sendMedia({
            from,
            to,
            mediaUrl: this.storage.externalUrl(interactive.imageUrl),
            caption: `*${interactive.title}*\n${interactive.subtitle}`,
          });
        } else {
          body = `${body}\n\n*${interactive.title}*\n${interactive.subtitle}`;
        }
      }
      // La plantilla de pago tiene cuerpo fijo: el resumen del pedido va antes, como texto.
      const textFirst = interactive.kind === "link_button" || body.length > INTERACTIVE_BODY_MAX;
      const content = await this.contentService.resolve(
        interactive,
        textFirst ? "Elige una opción:" : body,
      );
      if (!content) {
        return this.twilioClient.sendText({ from, to, text: fallback });
      }
      if (textFirst) {
        await this.twilioClient.sendText({ from, to, text: body });
      }
      return await this.twilioClient.sendContent({
        from,
        to,
        contentSid: content.contentSid,
        variables: content.variables,
      });
    } catch (error) {
      this.logger.warn(`Mensaje interactivo no enviado; se envía como texto: ${String(error)}`);
      return this.twilioClient.sendText({ from, to, text: fallback });
    }
  }

  private async sendOutboundMedia(params: {
    connection: { twilioWhatsAppNumber: string | null };
    conversationId: string;
    customerWaId: string;
    mediaUrl: string;
  }): Promise<void> {
    let sendResult: { simulated: boolean; wamid: string | null };
    let status: "sent" | "failed" = "sent";

    try {
      sendResult = !params.connection.twilioWhatsAppNumber
        ? { simulated: true, wamid: null }
        : await this.twilioClient.sendMedia({
            from: params.connection.twilioWhatsAppNumber,
            to: params.customerWaId,
            mediaUrl: this.storage.externalUrl(params.mediaUrl),
          });
    } catch (error) {
      this.logger.error(`Media auto-reply failed: ${String(error)}`);
      sendResult = { simulated: false, wamid: null };
      status = "failed";
    }

    await this.prisma.message.create({
      data: {
        conversationId: params.conversationId,
        direction: "outbound",
        wamid: sendResult.wamid,
        type: "image",
        body: params.mediaUrl,
        status,
        rawPayload: { mediaUrl: params.mediaUrl },
      },
    });
  }
}
