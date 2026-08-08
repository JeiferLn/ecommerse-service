import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  CartView,
  CheckoutOrderView,
  OrderDetails,
  OrderSummary,
  OrderStatus,
  PaginatedResponse,
  ShippingScope,
} from "@commerce-ai/types";
import { Prisma, type OrderStatus as PrismaOrderStatus } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { randomBytes } from "node:crypto";

import type { Env } from "../config/env.validation";
import { PrismaService } from "../prisma/prisma.service";
import type { CheckoutCartDto } from "./dto/cart.dto";
import type { CompletePublicCheckoutDto } from "./dto/public-checkout.dto";
import type { ListOrdersQueryDto } from "./dto/list-orders-query.dto";
import {
  countryDisplayName,
  describeShippingCoverage,
  resolveCountryCode,
  validateShippingCoverage,
} from "./shipping-coverage";

const OPEN_ORDER_STATUSES: PrismaOrderStatus[] = [
  "draft",
  "confirmed",
  "awaiting_payment",
  "paid",
  "preparing",
  "shipped",
];

const CHECKOUT_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

const STATUS_TRANSITIONS: Record<PrismaOrderStatus, PrismaOrderStatus[]> = {
  draft: ["confirmed", "awaiting_payment", "cancelled"],
  confirmed: ["awaiting_payment", "paid", "preparing", "cancelled"],
  awaiting_payment: ["confirmed", "paid", "preparing", "cancelled"],
  paid: ["preparing", "cancelled"],
  preparing: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async getCartForConversation(
    companyId: string | null,
    conversationId: string,
  ): Promise<CartView> {
    const scopedCompanyId = this.requireCompany(companyId);
    await this.findOwnedConversation(scopedCompanyId, conversationId);
    const cart = await this.ensureCart(scopedCompanyId, conversationId);
    return this.toCartView(cart.id);
  }

  async addCartItem(
    companyId: string | null,
    conversationId: string,
    variantId: string,
    quantity = 1,
  ): Promise<CartView> {
    const scopedCompanyId = this.requireCompany(companyId);
    if (quantity < 1) {
      throw new BadRequestException("La cantidad debe ser al menos 1");
    }
    await this.findOwnedConversation(scopedCompanyId, conversationId);
    const variant = await this.findActiveVariant(scopedCompanyId, variantId);
    if (variant.stock < quantity) {
      throw new BadRequestException(
        `Stock insuficiente para ${variant.product.name} (${variant.name}). Disponible: ${variant.stock}`,
      );
    }

    const cart = await this.ensureCart(scopedCompanyId, conversationId);
    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
    });
    const nextQty = (existing?.quantity ?? 0) + quantity;
    if (variant.stock < nextQty) {
      throw new BadRequestException(
        `Stock insuficiente. Disponible: ${variant.stock}, en carrito: ${existing?.quantity ?? 0}`,
      );
    }

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: nextQty },
      });
    } else {
      await this.prisma.cartItem.create({
        data: { cartId: cart.id, variantId, quantity },
      });
    }

    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { checkoutPending: false },
    });

    return this.toCartView(cart.id);
  }

  async updateCartItem(
    companyId: string | null,
    conversationId: string,
    itemId: string,
    quantity: number,
  ): Promise<CartView> {
    const scopedCompanyId = this.requireCompany(companyId);
    await this.findOwnedConversation(scopedCompanyId, conversationId);
    const cart = await this.ensureCart(scopedCompanyId, conversationId);
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
      include: { variant: true },
    });
    if (!item) {
      throw new NotFoundException("Ítem del carrito no encontrado");
    }

    if (quantity <= 0) {
      await this.prisma.cartItem.delete({ where: { id: item.id } });
    } else {
      if (item.variant.stock < quantity) {
        throw new BadRequestException(`Stock insuficiente. Disponible: ${item.variant.stock}`);
      }
      await this.prisma.cartItem.update({
        where: { id: item.id },
        data: { quantity },
      });
    }

    return this.toCartView(cart.id);
  }

  async clearCart(companyId: string | null, conversationId: string): Promise<CartView> {
    const scopedCompanyId = this.requireCompany(companyId);
    await this.findOwnedConversation(scopedCompanyId, conversationId);
    const cart = await this.ensureCart(scopedCompanyId, conversationId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await this.prisma.cart.update({
      where: { id: cart.id },
      data: {
        checkoutPending: false,
        shippingName: null,
        shippingPhone: null,
        shippingAddress: null,
        shippingCity: null,
      },
    });
    return this.toCartView(cart.id);
  }

  /**
   * Crea el pedido desde el carrito y devuelve el mensaje con link de checkout público.
   * Ya no pide dirección por WhatsApp.
   */
  async beginCheckout(
    companyId: string | null,
    conversationId: string,
  ): Promise<{ cart: CartView; message: string }> {
    const cart = await this.getCartForConversation(companyId, conversationId);
    if (cart.items.length === 0) {
      throw new BadRequestException("El carrito está vacío");
    }
    const order = await this.checkoutConversation(companyId, conversationId, {});
    return {
      cart: await this.getCartForConversation(companyId, conversationId),
      message: this.formatOrderConfirmationMessage(order),
    };
  }

  async getPublicCheckout(token: string): Promise<CheckoutOrderView> {
    const order = await this.findOrderByCheckoutToken(token);
    if (order.status === "cancelled") {
      throw new BadRequestException("Este pedido fue cancelado");
    }
    return this.toCheckoutOrderView(order);
  }

  async completePublicCheckout(
    token: string,
    dto: CompletePublicCheckoutDto,
  ): Promise<CheckoutOrderView> {
    if (!dto.confirmPayment) {
      throw new BadRequestException("Debes confirmar el pago para continuar");
    }

    const order = await this.findOrderByCheckoutToken(token);
    if (order.status === "cancelled") {
      throw new BadRequestException("Este pedido fue cancelado");
    }
    if (order.status !== "awaiting_payment" && order.status !== "confirmed") {
      return this.toCheckoutOrderView(order);
    }

    const shippingName = dto.shippingName.trim();
    const shippingPhone = dto.shippingPhone.trim();
    const shippingAddress = dto.shippingAddress.trim();
    const shippingCountry = dto.shippingCountry.trim();
    const shippingRegion = dto.shippingRegion.trim();
    const shippingCity = dto.shippingCity.trim();
    if (
      !shippingName ||
      !shippingPhone ||
      !shippingAddress ||
      !shippingCountry ||
      !shippingRegion ||
      !shippingCity
    ) {
      throw new BadRequestException(
        "Completa nombre, teléfono, país, departamento, ciudad y dirección",
      );
    }

    const coverageError = validateShippingCoverage({
      companyCountryCode: order.company.countryCode,
      companyCity: order.company.shippingCity,
      shippingScopes: order.company.shippingScopes,
      destinationCountry: shippingCountry,
      destinationCity: shippingCity,
    });
    if (coverageError) {
      throw new BadRequestException(coverageError);
    }

    const countryCode = resolveCountryCode(shippingCountry) ?? shippingCountry.toUpperCase();

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        shippingName,
        shippingPhone,
        shippingAddress,
        shippingCountry: countryCode,
        shippingRegion,
        shippingCity,
        status: "paid",
      },
      include: {
        items: true,
        company: {
          select: {
            name: true,
            countryCode: true,
            shippingRegion: true,
            shippingCity: true,
            shippingScopes: true,
          },
        },
      },
    });

    return this.toCheckoutOrderView(updated);
  }

  async checkoutConversation(
    companyId: string | null,
    conversationId: string,
    dto: CheckoutCartDto,
  ): Promise<OrderDetails> {
    const scopedCompanyId = this.requireCompany(companyId);
    const conversation = await this.findOwnedConversation(scopedCompanyId, conversationId);
    const cart = await this.ensureCart(scopedCompanyId, conversationId);
    const items = await this.prisma.cartItem.findMany({
      where: { cartId: cart.id },
      include: {
        variant: { include: { product: true } },
      },
    });
    if (items.length === 0) {
      throw new BadRequestException("El carrito está vacío");
    }

    for (const item of items) {
      if (item.variant.product.companyId !== scopedCompanyId) {
        throw new BadRequestException("Hay un producto que no pertenece a tu empresa");
      }
      if (item.variant.product.status !== "active") {
        throw new BadRequestException(
          `El producto "${item.variant.product.name}" ya no está activo`,
        );
      }
      if (item.variant.stock < item.quantity) {
        throw new BadRequestException(
          `Stock insuficiente para ${item.variant.product.name} (${item.variant.name})`,
        );
      }
    }

    const shippingName = dto.shippingName?.trim() || cart.shippingName;
    const shippingPhone =
      dto.shippingPhone?.trim() || cart.shippingPhone || conversation.customerWaId;
    const shippingAddress = dto.shippingAddress?.trim() || cart.shippingAddress;
    const shippingCity = dto.shippingCity?.trim() || cart.shippingCity;

    const company = await this.prisma.company.findUnique({
      where: { id: scopedCompanyId },
      select: { countryCode: true },
    });
    const currency = this.currencyForCountry(company?.countryCode);

    let subtotal = new Decimal(0);
    const lineData = items.map((item) => {
      const unitPrice = item.variant.price;
      const lineTotal = unitPrice.mul(item.quantity);
      subtotal = subtotal.add(lineTotal);
      return {
        variantId: item.variantId,
        productName: item.variant.product.name,
        variantName: item.variant.name,
        sku: item.variant.sku,
        unitPrice,
        quantity: item.quantity,
        lineTotal,
      };
    });

    const shippingCost = new Decimal(0);
    const total = subtotal.add(shippingCost);
    const number = await this.nextOrderNumber(scopedCompanyId);

    const order = await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        const updated = await tx.productVariant.updateMany({
          where: { id: item.variantId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (updated.count === 0) {
          throw new BadRequestException(
            `Stock insuficiente para ${item.variant.product.name} (${item.variant.name})`,
          );
        }
      }

      const created = await tx.order.create({
        data: {
          number,
          companyId: scopedCompanyId,
          conversationId,
          customerWaId: conversation.customerWaId,
          status: "awaiting_payment",
          currency,
          subtotal,
          shippingCost,
          total,
          shippingName,
          shippingPhone,
          shippingAddress,
          shippingCity,
          notes: dto.notes?.trim() || null,
          stockDecremented: true,
          checkoutToken: randomBytes(24).toString("hex"),
          checkoutExpiresAt: new Date(Date.now() + CHECKOUT_TOKEN_TTL_MS),
          items: { create: lineData },
        },
        include: { items: true },
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.update({
        where: { id: cart.id },
        data: {
          checkoutPending: false,
          shippingName: null,
          shippingPhone: null,
          shippingAddress: null,
          shippingCity: null,
        },
      });

      return created;
    });

    return this.toOrderDetails(order);
  }

  async listOrders(
    companyId: string | null,
    query: ListOrdersQueryDto,
  ): Promise<PaginatedResponse<OrderSummary>> {
    const scopedCompanyId = this.requireCompany(companyId);
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 20;
    const where: Prisma.OrderWhereInput = {
      companyId: scopedCompanyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.conversationId ? { conversationId: query.conversationId } : {}),
      ...(query.q
        ? {
            OR: [
              { number: { contains: query.q, mode: "insensitive" } },
              { customerWaId: { contains: query.q, mode: "insensitive" } },
              { shippingName: { contains: query.q, mode: "insensitive" } },
              { shippingCity: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        include: { _count: { select: { items: true } } },
      }),
    ]);

    return {
      items: orders.map((order) => this.toOrderSummary(order)),
      page,
      perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    };
  }

  async getOrder(companyId: string | null, orderId: string): Promise<OrderDetails> {
    const order = await this.findOwnedOrder(companyId, orderId);
    return this.toOrderDetails(order);
  }

  async updateStatus(
    companyId: string | null,
    orderId: string,
    status: OrderStatus,
  ): Promise<OrderDetails> {
    const order = await this.findOwnedOrder(companyId, orderId);
    if (order.status === status) {
      return this.toOrderDetails(order);
    }
    if (status === "cancelled") {
      return this.cancelOrder(companyId, orderId);
    }
    const allowed = STATUS_TRANSITIONS[order.status];
    if (!allowed.includes(status as PrismaOrderStatus)) {
      throw new BadRequestException(
        `No se puede pasar de ${order.status} a ${status}`,
      );
    }
    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { status: status as PrismaOrderStatus },
      include: { items: true },
    });
    return this.toOrderDetails(updated);
  }

  async cancelOrder(companyId: string | null, orderId: string): Promise<OrderDetails> {
    const order = await this.findOwnedOrder(companyId, orderId);
    if (order.status === "cancelled") {
      return this.toOrderDetails(order);
    }
    if (order.status === "delivered") {
      throw new BadRequestException("No se puede cancelar un pedido entregado");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (order.stockDecremented) {
        for (const item of order.items) {
          if (!item.variantId) {
            continue;
          }
          await tx.productVariant.updateMany({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }
      return tx.order.update({
        where: { id: order.id },
        data: { status: "cancelled", stockDecremented: false },
        include: { items: true },
      });
    });

    return this.toOrderDetails(updated);
  }

  formatCartMessage(cart: CartView): string {
    if (cart.items.length === 0) {
      return "Tu carrito está vacío. Dime qué producto quieres agregar.";
    }
    const lines = cart.items.map(
      (item) =>
        `• ${item.productName} (${item.variantName} / ${item.sku}) x${item.quantity} = $${item.lineTotal.toFixed(2)}`,
    );
    return [
      "Tu carrito:",
      ...lines,
      `Subtotal: $${cart.subtotal.toFixed(2)} ${cart.currency}`,
      'Para confirmar escribe "confirmar pedido". Para vaciar: "vaciar carrito".',
    ].join("\n");
  }

  formatOrderConfirmationMessage(order: OrderDetails): string {
    const lines = order.items.map(
      (item) => `• ${item.productName} (${item.variantName}) x${item.quantity}`,
    );
    const checkoutLine = order.checkoutUrl
      ? `Completa tus datos de envío y el pago aquí:\n${order.checkoutUrl}`
      : "Un asesor te enviará el enlace de pago y envío.";
    return [
      `Pedido ${order.number} registrado.`,
      ...lines,
      `Total: $${order.total.toFixed(2)} ${order.currency}`,
      checkoutLine,
      "No uses transferencias inventadas: el cobro es por el enlace de la plataforma.",
    ].join("\n");
  }

  async findVariantForAddIntent(
    companyId: string,
    text: string,
  ): Promise<{ variantId: string; quantity: number; label: string } | null> {
    const quantity = this.parseQuantityFromText(text);

    const products = await this.prisma.product.findMany({
      where: { companyId, status: "active" },
      include: { variants: true },
    });

    const normalized = this.normalize(text);
    const queryTokens = this.significantTokens(normalized);
    let best: { variantId: string; label: string; score: number } | null = null;

    for (const product of products) {
      for (const variant of product.variants) {
        const candidates = [
          product.name,
          variant.name,
          variant.sku,
          `${product.name} ${variant.name}`,
        ].map((value) => this.normalize(value));

        for (const candidate of candidates) {
          if (!candidate || candidate.length < 2) {
            continue;
          }

          let score = 0;
          if (normalized.includes(candidate) || candidate.includes(normalized)) {
            score = candidate.length + 20;
          } else {
            const candidateTokens = this.significantTokens(candidate);
            if (candidateTokens.length === 0 || queryTokens.length === 0) {
              continue;
            }
            const overlap = this.tokensOverlap(queryTokens, candidateTokens);
            if (overlap.length === 0) {
              continue;
            }
            // Requiere al menos la mitad de los tokens del nombre del producto (mín. 1).
            const needed = Math.max(1, Math.ceil(candidateTokens.length / 2));
            if (overlap.length < needed) {
              continue;
            }
            score = overlap.length * 10 + overlap.join("").length;
          }

          if (!best || score > best.score) {
            best = {
              variantId: variant.id,
              label: `${product.name} (${variant.name})`,
              score,
            };
          }
        }
      }
    }

    if (!best) {
      return null;
    }
    return { variantId: best.variantId, quantity, label: best.label };
  }

  private parseQuantityFromText(text: string): number {
    const words: Record<string, number> = {
      un: 1,
      una: 1,
      uno: 1,
      dos: 2,
      tres: 3,
      cuatro: 4,
      cinco: 5,
      seis: 6,
      siete: 7,
      ocho: 8,
      nueve: 9,
      diez: 10,
    };
    const normalized = this.normalize(text);
    const digit =
      text.match(/(?:x|×|\*)\s*(\d+)/i)?.[1] ||
      text.match(/\b(\d+)\s*(?:unidades?|uds?|piezas?)?\b/i)?.[1] ||
      normalized.match(/\bquiero\s+(\d+)\b/)?.[1] ||
      normalized.match(/\bdame\s+(\d+)\b/)?.[1];
    if (digit) {
      return Math.max(1, Number(digit));
    }
    const wordMatch = normalized.match(
      /\b(?:quiero|dame|pedir|agregar|anadir|añadir)\s+(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/,
    );
    if (wordMatch?.[1]) {
      const qty = words[wordMatch[1]];
      if (qty != null) {
        return qty;
      }
    }
    return 1;
  }

  private significantTokens(value: string): string[] {
    const stop = new Set([
      "el",
      "la",
      "los",
      "las",
      "un",
      "una",
      "unos",
      "unas",
      "de",
      "del",
      "al",
      "a",
      "y",
      "o",
      "en",
      "con",
      "por",
      "para",
      "que",
      "como",
      "quiero",
      "tienen",
      "tiene",
      "hay",
      "algun",
      "alguna",
      "agregar",
      "anadir",
      "meter",
      "sumar",
      "carrito",
      "me",
      "llevo",
      "compro",
      "x",
      "sea",
      "este",
      "esta",
      "eso",
      "articulo",
      "relacionado",
    ]);
    return value
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !stop.has(token));
  }

  /** Coincide tokens exactos o singular/plural cercano (gorra ↔ gorras). */
  private tokensOverlap(queryTokens: string[], candidateTokens: string[]): string[] {
    const matched: string[] = [];
    for (const candidate of candidateTokens) {
      const hit = queryTokens.find(
        (query) =>
          query === candidate ||
          (query.length >= 4 &&
            candidate.length >= 4 &&
            (query.startsWith(candidate) ||
              candidate.startsWith(query) ||
              query.slice(0, -1) === candidate ||
              candidate.slice(0, -1) === query)),
      );
      if (hit) {
        matched.push(candidate);
      }
    }
    return matched;
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private currencyForCountry(countryCode: string | null | undefined): string {
    switch (countryCode) {
      case "AR":
        return "ARS";
      case "BR":
        return "BRL";
      case "CL":
        return "CLP";
      case "MX":
        return "MXN";
      case "PE":
        return "PEN";
      case "UY":
        return "UYU";
      case "CO":
      default:
        return "COP";
    }
  }

  private async nextOrderNumber(companyId: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const number = `ORD-${randomBytes(3).toString("hex").toUpperCase()}`;
      const exists = await this.prisma.order.findUnique({
        where: { companyId_number: { companyId, number } },
        select: { id: true },
      });
      if (!exists) {
        return number;
      }
    }
    return `ORD-${Date.now().toString(36).toUpperCase()}`;
  }

  private async ensureCart(companyId: string, conversationId: string) {
    return this.prisma.cart.upsert({
      where: { conversationId },
      create: { companyId, conversationId },
      update: {},
    });
  }

  private async findOwnedConversation(companyId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, companyId },
    });
    if (!conversation) {
      throw new NotFoundException("Conversación no encontrada");
    }
    return conversation;
  }

  private async findActiveVariant(companyId: string, variantId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, product: { companyId } },
      include: { product: true },
    });
    if (!variant) {
      throw new NotFoundException("Variante no encontrada");
    }
    if (variant.product.status !== "active") {
      throw new BadRequestException("Solo se pueden agregar productos activos");
    }
    return variant;
  }

  private async findOwnedOrder(companyId: string | null, orderId: string) {
    const scopedCompanyId = this.requireCompany(companyId);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, companyId: scopedCompanyId },
      include: { items: true },
    });
    if (!order) {
      throw new NotFoundException("Pedido no encontrado");
    }
    return order;
  }

  private requireCompany(companyId: string | null): string {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }
    return companyId;
  }

  private async toCartView(cartId: string): Promise<CartView> {
    const cart = await this.prisma.cart.findUniqueOrThrow({
      where: { id: cartId },
      include: {
        items: {
          include: { variant: { include: { product: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    const company = await this.prisma.company.findUnique({
      where: { id: cart.companyId },
      select: { countryCode: true },
    });
    const items = cart.items.map((item) => {
      const unitPrice = Number(item.variant.price);
      return {
        id: item.id,
        variantId: item.variantId,
        productId: item.variant.productId,
        productName: item.variant.product.name,
        variantName: item.variant.name,
        sku: item.variant.sku,
        unitPrice,
        quantity: item.quantity,
        lineTotal: unitPrice * item.quantity,
        stock: item.variant.stock,
      };
    });
    return {
      id: cart.id,
      companyId: cart.companyId,
      conversationId: cart.conversationId,
      checkoutPending: cart.checkoutPending,
      shippingName: cart.shippingName,
      shippingPhone: cart.shippingPhone,
      shippingAddress: cart.shippingAddress,
      shippingCity: cart.shippingCity,
      items,
      subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0),
      currency: this.currencyForCountry(company?.countryCode),
      updatedAt: cart.updatedAt.toISOString(),
    };
  }

  private toOrderSummary(order: {
    id: string;
    number: string;
    companyId: string;
    conversationId: string | null;
    customerWaId: string;
    status: PrismaOrderStatus;
    currency: string;
    subtotal: Decimal;
    shippingCost: Decimal;
    total: Decimal;
    shippingCity: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count: { items: number };
  }): OrderSummary {
    return {
      id: order.id,
      number: order.number,
      companyId: order.companyId,
      conversationId: order.conversationId,
      customerWaId: order.customerWaId,
      status: order.status as OrderStatus,
      currency: order.currency,
      subtotal: Number(order.subtotal),
      shippingCost: Number(order.shippingCost),
      total: Number(order.total),
      itemsCount: order._count.items,
      shippingCity: order.shippingCity,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  private frontendBaseUrl(): string {
    return this.config.getOrThrow<string>("FRONTEND_URL").replace(/\/$/, "");
  }

  private buildCheckoutUrl(token: string | null | undefined): string | null {
    if (!token) {
      return null;
    }
    return `${this.frontendBaseUrl()}/checkout/${token}`;
  }

  private async findOrderByCheckoutToken(token: string) {
    const normalized = token.trim();
    if (!normalized) {
      throw new NotFoundException("Checkout no encontrado");
    }
    const order = await this.prisma.order.findUnique({
      where: { checkoutToken: normalized },
      include: {
        items: true,
        company: {
          select: {
            name: true,
            countryCode: true,
            shippingRegion: true,
            shippingCity: true,
            shippingScopes: true,
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException("Checkout no encontrado o ya utilizado");
    }
    if (order.checkoutExpiresAt && order.checkoutExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Este enlace de checkout expiró. Pide uno nuevo por WhatsApp.");
    }
    return order;
  }

  private toCheckoutOrderView(order: {
    number: string;
    status: PrismaOrderStatus;
    currency: string;
    subtotal: Decimal;
    shippingCost: Decimal;
    total: Decimal;
    shippingName: string | null;
    shippingPhone: string | null;
    shippingAddress: string | null;
    shippingCountry?: string | null;
    shippingRegion?: string | null;
    shippingCity: string | null;
    checkoutExpiresAt: Date | null;
    items: {
      id: string;
      variantId: string | null;
      productName: string;
      variantName: string;
      sku: string;
      unitPrice: Decimal;
      quantity: number;
      lineTotal: Decimal;
    }[];
    company: {
      name: string;
      countryCode: string | null;
      shippingRegion: string | null;
      shippingCity: string | null;
      shippingScopes: string[];
    };
  }): CheckoutOrderView {
    const scopes = order.company.shippingScopes as ShippingScope[];
    return {
      number: order.number,
      status: order.status as OrderStatus,
      currency: order.currency,
      subtotal: Number(order.subtotal),
      shippingCost: Number(order.shippingCost),
      total: Number(order.total),
      companyName: order.company.name,
      shippingName: order.shippingName,
      shippingPhone: order.shippingPhone,
      shippingAddress: order.shippingAddress,
      shippingCountry: order.shippingCountry ?? null,
      shippingRegion: order.shippingRegion ?? null,
      shippingCity: order.shippingCity,
      shippingCoverage: {
        countryCode: order.company.countryCode,
        countryName: countryDisplayName(order.company.countryCode) || null,
        baseRegion: order.company.shippingRegion,
        baseCity: order.company.shippingCity,
        scopes,
        summary: describeShippingCoverage({
          countryCode: order.company.countryCode,
          shippingRegion: order.company.shippingRegion,
          shippingCity: order.company.shippingCity,
          shippingScopes: scopes,
        }),
      },
      expiresAt: order.checkoutExpiresAt?.toISOString() ?? null,
      items: order.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        productName: item.productName,
        variantName: item.variantName,
        sku: item.sku,
        unitPrice: Number(item.unitPrice),
        quantity: item.quantity,
        lineTotal: Number(item.lineTotal),
      })),
    };
  }

  private toOrderDetails(order: {
    id: string;
    number: string;
    companyId: string;
    conversationId: string | null;
    customerWaId: string;
    status: PrismaOrderStatus;
    currency: string;
    subtotal: Decimal;
    shippingCost: Decimal;
    total: Decimal;
    shippingName: string | null;
    shippingPhone: string | null;
    shippingAddress: string | null;
    shippingCountry?: string | null;
    shippingRegion?: string | null;
    shippingCity: string | null;
    notes: string | null;
    checkoutToken?: string | null;
    createdAt: Date;
    updatedAt: Date;
    items: {
      id: string;
      variantId: string | null;
      productName: string;
      variantName: string;
      sku: string;
      unitPrice: Decimal;
      quantity: number;
      lineTotal: Decimal;
    }[];
  }): OrderDetails {
    return {
      id: order.id,
      number: order.number,
      companyId: order.companyId,
      conversationId: order.conversationId,
      customerWaId: order.customerWaId,
      status: order.status as OrderStatus,
      currency: order.currency,
      subtotal: Number(order.subtotal),
      shippingCost: Number(order.shippingCost),
      total: Number(order.total),
      shippingName: order.shippingName,
      shippingPhone: order.shippingPhone,
      shippingAddress: order.shippingAddress,
      shippingCountry: order.shippingCountry ?? null,
      shippingRegion: order.shippingRegion ?? null,
      shippingCity: order.shippingCity,
      notes: order.notes,
      checkoutUrl: this.buildCheckoutUrl(order.checkoutToken),
      items: order.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        productName: item.productName,
        variantName: item.variantName,
        sku: item.sku,
        unitPrice: Number(item.unitPrice),
        quantity: item.quantity,
        lineTotal: Number(item.lineTotal),
      })),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }
}

export { OPEN_ORDER_STATUSES };
