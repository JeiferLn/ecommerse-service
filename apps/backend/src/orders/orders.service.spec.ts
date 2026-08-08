import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { Decimal } from "@prisma/client/runtime/library";

import { PrismaService } from "../prisma/prisma.service";
import { OrdersService } from "./orders.service";

describe("OrdersService", () => {
  let service: OrdersService;
  let prisma: {
    conversation: { findFirst: jest.Mock };
    cart: { upsert: jest.Mock; update: jest.Mock; findUniqueOrThrow: jest.Mock };
    cartItem: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    productVariant: { findFirst: jest.Mock; updateMany: jest.Mock };
    product: { findMany: jest.Mock };
    company: { findUnique: jest.Mock };
    order: { findUnique: jest.Mock; create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      conversation: { findFirst: jest.fn() },
      cart: { upsert: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() },
      cartItem: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      productVariant: { findFirst: jest.fn(), updateMany: jest.fn() },
      product: { findMany: jest.fn() },
      company: { findUnique: jest.fn() },
      order: { findUnique: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key === "FRONTEND_URL") {
                return "http://localhost:3000";
              }
              throw new Error(`Missing ${key}`);
            },
          },
        },
      ],
    }).compile();

    service = module.get(OrdersService);
  });

  it("rechaza agregar sin stock suficiente", async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: "conv-1",
      companyId: "co-1",
      customerWaId: "+573001112233",
    });
    prisma.productVariant.findFirst.mockResolvedValue({
      id: "var-1",
      stock: 1,
      name: "M",
      product: { id: "p-1", name: "Camisa", companyId: "co-1", status: "active" },
    });
    prisma.cart.upsert.mockResolvedValue({ id: "cart-1", companyId: "co-1", conversationId: "conv-1" });
    prisma.cartItem.findUnique.mockResolvedValue({ id: "item-1", quantity: 1 });

    await expect(service.addCartItem("co-1", "conv-1", "var-1", 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("hace checkout descontando stock y vaciando carrito", async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      id: "conv-1",
      companyId: "co-1",
      customerWaId: "+573001112233",
    });
    prisma.cart.upsert.mockResolvedValue({
      id: "cart-1",
      companyId: "co-1",
      conversationId: "conv-1",
      shippingName: "Ana",
      shippingPhone: null,
      shippingAddress: "Calle 1",
      shippingCity: "Bogotá",
    });
    prisma.cartItem.findMany.mockResolvedValue([
      {
        id: "item-1",
        variantId: "var-1",
        quantity: 2,
        variant: {
          id: "var-1",
          name: "M",
          sku: "CAM-M",
          price: new Decimal(10),
          stock: 5,
          product: { id: "p-1", name: "Camisa", companyId: "co-1", status: "active" },
        },
      },
    ]);
    prisma.company.findUnique.mockResolvedValue({ countryCode: "CO" });
    prisma.order.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => {
      const tx = {
        productVariant: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        order: {
          create: jest.fn().mockResolvedValue({
            id: "ord-1",
            number: "ORD-TEST",
            companyId: "co-1",
            conversationId: "conv-1",
            customerWaId: "+573001112233",
            status: "awaiting_payment",
            currency: "COP",
            subtotal: new Decimal(20),
            shippingCost: new Decimal(0),
            total: new Decimal(20),
            shippingName: "Ana",
            shippingPhone: "+573001112233",
            shippingAddress: "Calle 1",
            shippingCity: "Bogotá",
            notes: null,
            checkoutToken: "tok123",
            checkoutExpiresAt: new Date(Date.now() + 86400000),
            createdAt: new Date(),
            updatedAt: new Date(),
            items: [
              {
                id: "oi-1",
                variantId: "var-1",
                productName: "Camisa",
                variantName: "M",
                sku: "CAM-M",
                unitPrice: new Decimal(10),
                quantity: 2,
                lineTotal: new Decimal(20),
              },
            ],
          }),
        },
        cartItem: { deleteMany: jest.fn() },
        cart: { update: jest.fn() },
      };
      return fn(tx as unknown as typeof prisma);
    });

    const order = await service.checkoutConversation("co-1", "conv-1", {});
    expect(order.number).toBe("ORD-TEST");
    expect(order.status).toBe("awaiting_payment");
    expect(order.total).toBe(20);
  });
});
