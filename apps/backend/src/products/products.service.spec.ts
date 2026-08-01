import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Decimal } from "@prisma/client/runtime/library";

import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { ProductsService } from "./products.service";

describe("ProductsService", () => {
  let service: ProductsService;
  let prisma: {
    $transaction: jest.Mock;
    product: {
      count: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    productVariant: {
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      findFirst: jest.Mock;
    };
    productImage: {
      create: jest.Mock;
      findFirst: jest.Mock;
      delete: jest.Mock;
    };
    category: {
      findFirst: jest.Mock;
    };
  };
  let storage: {
    uploadProductImage: jest.Mock;
    deleteObject: jest.Mock;
  };

  const baseProduct = {
    id: "prod-1",
    companyId: "company-1",
    categoryId: null,
    name: "Camiseta",
    description: null,
    status: "active" as const,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    category: null,
    variants: [
      {
        id: "var-1",
        productId: "prod-1",
        sku: "TEE-M",
        name: "M",
        price: new Decimal(20),
        compareAtPrice: null,
        stock: 5,
        attributes: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
    images: [],
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn((ops: unknown) => {
        if (Array.isArray(ops)) {
          return Promise.all(ops);
        }
        return ops;
      }),
      product: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([baseProduct]),
        findFirst: jest.fn().mockResolvedValue(baseProduct),
        create: jest.fn().mockResolvedValue(baseProduct),
        update: jest.fn().mockResolvedValue(baseProduct),
        delete: jest.fn().mockResolvedValue(baseProduct),
      },
      productVariant: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(baseProduct.variants[0]),
      },
      productImage: {
        create: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
      category: {
        findFirst: jest.fn(),
      },
    };

    storage = {
      uploadProductImage: jest.fn(),
      deleteObject: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();

    service = module.get(ProductsService);
  });

  it("lista productos paginados de la empresa", async () => {
    const result = await service.list("company-1", { page: 1, perPage: 12 });
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: "prod-1",
      name: "Camiseta",
      totalStock: 5,
      minPrice: 20,
    });
  });

  it("crea producto con variante por defecto", async () => {
    await service.create("company-1", { name: "Camiseta" });
    expect(prisma.product.create).toHaveBeenCalled();
    const args = prisma.product.create.mock.calls[0][0];
    expect(args.data.companyId).toBe("company-1");
    expect(args.data.variants.create).toHaveLength(1);
  });

  it("actualiza stock por valor absoluto", async () => {
    prisma.productVariant.update.mockResolvedValue({
      ...baseProduct.variants[0],
      stock: 12,
    });

    const variant = await service.updateStock("company-1", "prod-1", "var-1", { stock: 12 });
    expect(variant.stock).toBe(12);
  });

  it("actualiza stock por delta y evita negativos", async () => {
    await expect(
      service.updateStock("company-1", "prod-1", "var-1", { delta: -10 }),
    ).rejects.toThrow(BadRequestException);
  });

  it("no elimina la última variante", async () => {
    await expect(service.removeVariant("company-1", "prod-1", "var-1")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("exige empresa activa", async () => {
    await expect(service.list(null, {})).rejects.toThrow(BadRequestException);
  });

  it("lanza NotFound si el producto no existe", async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    await expect(service.getById("company-1", "missing")).rejects.toThrow(NotFoundException);
  });
});
