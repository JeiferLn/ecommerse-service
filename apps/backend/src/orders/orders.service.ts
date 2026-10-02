import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  CartView,
  CheckoutOrderView,
  CheckoutPaymentStart,
  InStorePaymentMethod,
  OrderChannel,
  OrderDetails,
  OrderSummary,
  OrderStatus,
  PaginatedResponse,
  ShippingScope,
} from "@commerce-ai/types";
import {
  Prisma,
  type InStorePaymentMethod as PrismaInStorePaymentMethod,
  type OrderChannel as PrismaOrderChannel,
  type OrderStatus as PrismaOrderStatus,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { randomBytes } from "node:crypto";

import type { Env } from "../config/env.validation";
import { MercadoPagoService } from "../payments/mercadopago.service";
import { PrismaService } from "../prisma/prisma.service";
import type { SuggestedProduct } from "../whatsapp/interactive-message.util";
import { TwilioWhatsAppClient } from "../whatsapp/twilio-whatsapp.client";
import type { CheckoutCartDto } from "./dto/cart.dto";
import type { CreateInStoreSaleDto } from "./dto/create-in-store-sale.dto";
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

const POST_PAYMENT_STATUSES: PrismaOrderStatus[] = ["paid", "preparing", "shipped", "delivered"];

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
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly mercadoPago: MercadoPagoService,
    private readonly twilioClient: TwilioWhatsAppClient,
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
  ): Promise<{ cart: CartView; message: string; summary: string; checkoutUrl: string | null }> {
    const cart = await this.getCartForConversation(companyId, conversationId);
    if (cart.items.length === 0) {
      throw new BadRequestException("El carrito está vacío");
    }
    const order = await this.checkoutConversation(companyId, conversationId, {});
    return {
      cart: await this.getCartForConversation(companyId, conversationId),
      message: this.formatOrderConfirmationMessage(order),
      summary: this.formatOrderConfirmationMessage(order, { includeLink: false }),
      checkoutUrl: order.checkoutUrl ?? null,
    };
  }

  /**
   * Productos activos con variantes y foto principal, para listas y tarjetas del chat.
   * Con `productIds` respeta ese orden; sin ellos, los más recientes.
   */
  async getSuggestedProducts(
    companyId: string,
    options: { productIds?: string[]; limit?: number } = {},
  ): Promise<SuggestedProduct[]> {
    const limit = options.limit ?? 10;
    if (options.productIds && options.productIds.length === 0) {
      return [];
    }
    const [company, products] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId }, select: { countryCode: true } }),
      this.prisma.product.findMany({
        where: {
          companyId,
          status: "active",
          ...(options.productIds ? { id: { in: options.productIds } } : {}),
        },
        include: {
          variants: {
            select: { id: true, name: true, price: true, stock: true },
            orderBy: { createdAt: "asc" },
          },
          images: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
        },
        orderBy: { updatedAt: "desc" },
        take: options.productIds ? options.productIds.length : limit,
      }),
    ]);
    const currency = this.currencyForCountry(company?.countryCode);
    const order = options.productIds ?? [];
    return products
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
      .slice(0, limit)
      .map((product) => ({
        id: product.id,
        name: product.name,
        imageUrl: product.images[0]?.url ?? null,
        currency,
        variants: product.variants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          price: Number(variant.price),
          stock: variant.stock,
        })),
      }));
  }

  async getPublicCheckout(token: string): Promise<CheckoutOrderView> {
    const order = await this.findOrderByCheckoutToken(token, { allowExpiredIfPaid: true });
    if (order.status === "cancelled") {
      throw new BadRequestException("Este pedido fue cancelado");
    }
    return this.toCheckoutOrderView(order);
  }

  /**
   * Marca el pedido como pagado desde un webhook de Mercado Pago (idempotente).
   * @returns newlyPaid=true solo la primera vez que pasa a paid.
   */
  async markPaidFromMercadoPago(params: { orderId: string; mpPaymentId: string }): Promise<{
    newlyPaid: boolean;
    order: {
      id: string;
      number: string;
      companyId: string;
      conversationId: string | null;
      currency: string;
      total: Decimal;
      status: PrismaOrderStatus;
      items: { productName: string; variantName: string; quantity: number }[];
    };
  }> {
    const order = await this.prisma.order.findUnique({
      where: { id: params.orderId },
      include: {
        items: {
          select: { productName: true, variantName: true, quantity: true },
        },
      },
    });
    if (!order) {
      throw new NotFoundException("Pedido no encontrado para este pago");
    }

    if (POST_PAYMENT_STATUSES.includes(order.status)) {
      if (!order.mpPaymentId && params.mpPaymentId) {
        await this.prisma.order.update({
          where: { id: order.id },
          data: { mpPaymentId: params.mpPaymentId },
        });
      }
      return {
        newlyPaid: false,
        order: {
          id: order.id,
          number: order.number,
          companyId: order.companyId,
          conversationId: order.conversationId,
          currency: order.currency,
          total: order.total,
          status: order.status,
          items: order.items,
        },
      };
    }

    if (order.status === "cancelled") {
      throw new BadRequestException("El pedido está cancelado y no se puede marcar como pagado");
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: "paid",
        mpPaymentId: params.mpPaymentId,
      },
      include: {
        items: {
          select: { productName: true, variantName: true, quantity: true },
        },
      },
    });

    return {
      newlyPaid: true,
      order: {
        id: updated.id,
        number: updated.number,
        companyId: updated.companyId,
        conversationId: updated.conversationId,
        currency: updated.currency,
        total: updated.total,
        status: updated.status,
        items: updated.items,
      },
    };
  }

  formatPaymentConfirmedWhatsAppMessage(order: {
    number: string;
    currency: string;
    total: Decimal | number;
    items: { productName: string; variantName: string; quantity: number }[];
  }): string {
    const total = typeof order.total === "number" ? order.total : Number(order.total);
    const lines = order.items.map(
      (item) => `• ${item.productName} (${item.variantName}) x${item.quantity}`,
    );
    return [
      `¡Pago confirmado! Pedido ${order.number}.`,
      ...lines,
      `Total: $${total.toFixed(2)} ${order.currency}`,
      "La tienda preparará tu envío. Gracias por tu compra.",
    ].join("\n");
  }

  async completePublicCheckout(
    token: string,
    dto: CompletePublicCheckoutDto,
  ): Promise<CheckoutPaymentStart> {
    if (!dto.confirmPayment) {
      throw new BadRequestException("Debes confirmar el pago para continuar");
    }

    const order = await this.findOrderByCheckoutToken(token, { allowExpiredIfPaid: false });
    if (order.status === "cancelled") {
      throw new BadRequestException("Este pedido fue cancelado");
    }
    if (POST_PAYMENT_STATUSES.includes(order.status)) {
      throw new BadRequestException("Este pedido ya fue pagado");
    }
    if (order.status !== "awaiting_payment" && order.status !== "confirmed") {
      throw new BadRequestException("Este pedido no está disponible para pago");
    }

    let companyAccessToken: string;
    try {
      companyAccessToken = await this.mercadoPago.getAccessTokenForCompany(order.companyId);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        "La tienda aún no conectó Mercado Pago. El dueño debe hacerlo en Configuración → Pagos.",
      );
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
    const frontendUrl = (
      this.config.get("FRONTEND_URL", { infer: true }) || "http://localhost:3000"
    ).replace(/\/$/, "");
    const backBase = `${frontendUrl}/checkout/${token}`;
    const backUrls = {
      success: `${backBase}?status=success`,
      pending: `${backBase}?status=pending`,
      failure: `${backBase}?status=failure`,
    };
    // Mercado Pago solo acepta auto_return con back_urls HTTPS (localhost HTTP falla).
    const canAutoReturn = frontendUrl.startsWith("https://");
    const notificationUrlBase = this.mercadoPago.getWebhookNotificationUrl();
    const notificationUrl = notificationUrlBase
      ? `${notificationUrlBase}${notificationUrlBase.includes("?") ? "&" : "?"}companyId=${encodeURIComponent(order.companyId)}`
      : null;

    let preference;
    try {
      preference = await this.mercadoPago.preferenceApi(companyAccessToken).create({
        body: {
          items: order.items.map((item) => ({
            id: item.sku || item.id,
            title: `${item.productName} (${item.variantName})`.slice(0, 256),
            quantity: item.quantity,
            unit_price: Number(item.unitPrice),
            currency_id: order.currency,
          })),
          external_reference: order.id,
          metadata: {
            orderId: order.id,
            orderNumber: order.number,
            checkoutToken: token,
            companyId: order.companyId,
          },
          payer: {
            name: shippingName,
            phone: { number: shippingPhone },
          },
          back_urls: backUrls,
          ...(canAutoReturn ? { auto_return: "approved" as const } : {}),
          ...(notificationUrl ? { notification_url: notificationUrl } : {}),
          statement_descriptor: order.company.name.slice(0, 22),
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo crear el pago en Mercado Pago";
      throw new BadRequestException(
        message.includes("auto_return")
          ? "Mercado Pago rechazó la URL de retorno. En local usamos HTTP sin auto_return."
          : `Mercado Pago: ${message}`,
      );
    }

    const preferenceId = preference.id;
    const paymentUrl = preference.sandbox_init_point || preference.init_point || null;
    if (!preferenceId || !paymentUrl) {
      throw new BadRequestException(
        "Mercado Pago no devolvió un enlace de pago. Revisa las credenciales.",
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        shippingName,
        shippingPhone,
        shippingAddress,
        shippingCountry: countryCode,
        shippingRegion,
        shippingCity,
        status: "awaiting_payment",
        mpPreferenceId: preferenceId,
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

    return {
      order: this.toCheckoutOrderView(updated),
      preferenceId,
      paymentUrl,
    };
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
          channel: "whatsapp",
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

  async createInStoreSale(
    companyId: string | null,
    dto: CreateInStoreSaleDto,
  ): Promise<OrderDetails> {
    const scopedCompanyId = this.requireCompany(companyId);
    if (!dto.items?.length) {
      throw new BadRequestException("Agrega al menos un producto");
    }

    const qtyByVariant = new Map<string, number>();
    for (const item of dto.items) {
      const qty = item.quantity;
      if (!Number.isInteger(qty) || qty < 1) {
        throw new BadRequestException("La cantidad debe ser un entero mayor a 0");
      }
      qtyByVariant.set(item.variantId, (qtyByVariant.get(item.variantId) ?? 0) + qty);
    }

    const variantIds = [...qtyByVariant.keys()];
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds }, product: { companyId: scopedCompanyId } },
      include: { product: true },
    });
    if (variants.length !== variantIds.length) {
      throw new BadRequestException("Hay productos que no pertenecen a tu empresa");
    }

    for (const variant of variants) {
      const quantity = qtyByVariant.get(variant.id) ?? 0;
      if (variant.product.status !== "active") {
        throw new BadRequestException(`El producto "${variant.product.name}" ya no está activo`);
      }
      if (variant.stock < quantity) {
        throw new BadRequestException(
          `Stock insuficiente para ${variant.product.name} (${variant.name}). Disponible: ${variant.stock}`,
        );
      }
    }

    const company = await this.prisma.company.findUnique({
      where: { id: scopedCompanyId },
      select: { countryCode: true },
    });
    const currency = this.currencyForCountry(company?.countryCode);

    let subtotal = new Decimal(0);
    const lineData = variants.map((variant) => {
      const quantity = qtyByVariant.get(variant.id)!;
      const unitPrice = variant.price;
      const lineTotal = unitPrice.mul(quantity);
      subtotal = subtotal.add(lineTotal);
      return {
        variantId: variant.id,
        productName: variant.product.name,
        variantName: variant.name,
        sku: variant.sku,
        unitPrice,
        quantity,
        lineTotal,
      };
    });

    const shippingCost = new Decimal(0);
    const total = subtotal.add(shippingCost);
    const number = await this.nextOrderNumber(scopedCompanyId);
    const customerName = dto.customerName?.trim() || null;
    const customerPhone = dto.customerPhone?.trim() || null;

    const order = await this.prisma.$transaction(async (tx) => {
      for (const variant of variants) {
        const quantity = qtyByVariant.get(variant.id)!;
        const updated = await tx.productVariant.updateMany({
          where: { id: variant.id, stock: { gte: quantity } },
          data: { stock: { decrement: quantity } },
        });
        if (updated.count === 0) {
          throw new BadRequestException(
            `Stock insuficiente para ${variant.product.name} (${variant.name})`,
          );
        }
      }

      return tx.order.create({
        data: {
          number,
          companyId: scopedCompanyId,
          conversationId: null,
          customerWaId: null,
          channel: "in_store",
          inStorePaymentMethod: dto.paymentMethod,
          status: "delivered",
          currency,
          subtotal,
          shippingCost,
          total,
          shippingName: customerName,
          shippingPhone: customerPhone,
          notes: dto.notes?.trim() || null,
          stockDecremented: true,
          items: { create: lineData },
        },
        include: { items: true },
      });
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
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.conversationId ? { conversationId: query.conversationId } : {}),
      ...(query.q
        ? {
            OR: [
              { number: { contains: query.q, mode: "insensitive" } },
              { customerWaId: { contains: query.q, mode: "insensitive" } },
              { shippingName: { contains: query.q, mode: "insensitive" } },
              { shippingCity: { contains: query.q, mode: "insensitive" } },
              { shippingPhone: { contains: query.q, mode: "insensitive" } },
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
    if (order.channel === "in_store") {
      throw new BadRequestException(
        "Las ventas de tienda solo se pueden cancelar; no cambian de estado de envío",
      );
    }
    const allowed = STATUS_TRANSITIONS[order.status];
    if (!allowed.includes(status)) {
      throw new BadRequestException(`No se puede pasar de ${order.status} a ${status}`);
    }
    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { status: status },
      include: { items: true },
    });
    const details = this.toOrderDetails(updated);
    if (status === "shipped" || status === "delivered") {
      await this.notifyCustomerOrderStatus({
        number: updated.number,
        companyId: updated.companyId,
        conversationId: updated.conversationId,
        customerWaId: updated.customerWaId,
        status: updated.status,
      });
    }
    return details;
  }

  async cancelOrder(companyId: string | null, orderId: string): Promise<OrderDetails> {
    const order = await this.findOwnedOrder(companyId, orderId);
    if (order.status === "cancelled") {
      return this.toOrderDetails(order);
    }
    if (order.status === "delivered" && order.channel !== "in_store") {
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

    const details = this.toOrderDetails(updated);
    await this.notifyCustomerOrderStatus({
      number: updated.number,
      companyId: updated.companyId,
      conversationId: updated.conversationId,
      customerWaId: updated.customerWaId,
      status: updated.status,
    });
    return details;
  }

  /** Con `withInstructions: false` omite cómo confirmar o vaciar (van como botones). */
  formatCartMessage(cart: CartView, options: { withInstructions?: boolean } = {}): string {
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
      ...(options.withInstructions === false
        ? []
        : ['Para confirmar escribe "confirmar pedido". Para vaciar: "vaciar carrito".']),
    ].join("\n");
  }

  /** Con `includeLink: false` el enlace va aparte (botón "Pagar pedido"). */
  formatOrderConfirmationMessage(
    order: OrderDetails,
    options: { includeLink?: boolean } = {},
  ): string {
    const lines = order.items.map(
      (item) => `• ${item.productName} (${item.variantName}) x${item.quantity}`,
    );
    const checkoutLine = order.checkoutUrl
      ? options.includeLink === false
        ? "Completa tus datos de envío y paga desde el botón."
        : `Completa tus datos de envío y el pago aquí:\n${order.checkoutUrl}`
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

  /** Avisa al cliente por WhatsApp cuando el pedido se envía, entrega o cancela. */
  private async notifyCustomerOrderStatus(order: {
    number: string;
    companyId: string;
    conversationId: string | null;
    customerWaId: string | null;
    status: PrismaOrderStatus;
  }): Promise<void> {
    if (!order.customerWaId && !order.conversationId) {
      return;
    }
    const textByStatus: Partial<Record<PrismaOrderStatus, string>> = {
      shipped: [
        `Tu pedido ${order.number} ya fue enviado.`,
        "Pronto llegará a tu dirección. Cualquier duda, escríbenos por aquí.",
      ].join("\n"),
      delivered: [
        `Tu pedido ${order.number} fue marcado como entregado.`,
        "¡Gracias por tu compra!",
      ].join("\n"),
      cancelled: [
        `Tu pedido ${order.number} fue cancelado.`,
        "Si tienes dudas o quieres hacer otro pedido, escríbenos por aquí.",
      ].join("\n"),
    };
    const text = textByStatus[order.status];
    if (!text) {
      return;
    }

    const conversation = order.conversationId
      ? await this.prisma.conversation.findFirst({
          where: { id: order.conversationId, companyId: order.companyId },
          include: { waConnection: true },
        })
      : order.customerWaId
        ? await this.prisma.conversation.findFirst({
            where: { companyId: order.companyId, customerWaId: order.customerWaId },
            include: { waConnection: true },
            orderBy: { lastMessageAt: "desc" },
          })
        : null;

    if (!conversation?.waConnection?.isActive) {
      this.logger.warn(
        `Pedido ${order.number}: no se pudo notificar estado ${order.status} (sin WA activo)`,
      );
      return;
    }

    let wamid: string | null = null;
    let status: "sent" | "failed" = "sent";
    try {
      const result = await this.twilioClient.sendText({
        from: conversation.waConnection.twilioWhatsAppNumber,
        to: conversation.customerWaId,
        text,
      });
      wamid = result.wamid;
    } catch (error) {
      status = "failed";
      this.logger.warn(
        `Pedido ${order.number}: falló WhatsApp al notificar ${order.status}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "outbound",
        wamid,
        type: "text",
        body: text,
        status,
      },
    });
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });
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
    customerWaId: string | null;
    channel: PrismaOrderChannel;
    inStorePaymentMethod: PrismaInStorePaymentMethod | null;
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
      channel: order.channel,
      inStorePaymentMethod: order.inStorePaymentMethod,
      status: order.status,
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

  private async findOrderByCheckoutToken(
    token: string,
    options?: { allowExpiredIfPaid?: boolean },
  ) {
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
    const expired =
      Boolean(order.checkoutExpiresAt) && order.checkoutExpiresAt!.getTime() < Date.now();
    if (expired) {
      const allowPaid = options?.allowExpiredIfPaid && POST_PAYMENT_STATUSES.includes(order.status);
      if (!allowPaid) {
        throw new BadRequestException(
          "Este enlace de checkout expiró. Pide uno nuevo por WhatsApp.",
        );
      }
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
      status: order.status,
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
    customerWaId: string | null;
    channel: PrismaOrderChannel;
    inStorePaymentMethod: PrismaInStorePaymentMethod | null;
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
      channel: order.channel,
      inStorePaymentMethod: order.inStorePaymentMethod,
      status: order.status,
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
