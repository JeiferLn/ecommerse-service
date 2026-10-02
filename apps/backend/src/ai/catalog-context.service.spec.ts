import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { PrismaService } from "../prisma/prisma.service";
import { CatalogContextService } from "./catalog-context.service";

describe("CatalogContextService", () => {
  let service: CatalogContextService;
  let prisma: {
    company: { findUnique: jest.Mock };
    product: { findMany: jest.Mock; count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      company: { findUnique: jest.fn() },
      product: { findMany: jest.fn(), count: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogContextService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: () => 2 },
        },
      ],
    }).compile();

    service = module.get(CatalogContextService);
  });

  it("aísla por companyId y solo productos active", async () => {
    prisma.company.findUnique.mockResolvedValue({ name: "Tienda Demo" });
    prisma.product.count.mockResolvedValue(2);
    prisma.product.findMany.mockResolvedValue([
      {
        name: "Camiseta Azul",
        description: "Algodón",
        updatedAt: new Date("2026-08-01"),
        category: { name: "Ropa" },
        variants: [{ sku: "CA-M", name: "M", price: 25, stock: 3 }],
        images: [],
      },
      {
        name: "Zapatos",
        description: null,
        updatedAt: new Date("2026-07-01"),
        category: null,
        variants: [{ sku: "Z-1", name: "42", price: 80, stock: 1 }],
        images: [],
      },
    ]);

    const result = await service.buildForCompany("company-a", "camiseta azul");

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: "company-a", status: "active" },
      }),
    );
    expect(result.companyName).toBe("Tienda Demo");
    expect(result.productCount).toBe(2);
    expect(result.catalogBlock).toContain("Camiseta Azul");
  });

  it("respeta el tope de productos en el bloque de detalle", async () => {
    prisma.company.findUnique.mockResolvedValue({ name: "Tienda" });
    prisma.product.count.mockResolvedValue(5);
    prisma.product.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        name: `Producto ${index}`,
        description: null,
        updatedAt: new Date(2026, 0, index + 1),
        category: null,
        variants: [{ sku: `S${index}`, name: "Default", price: 10, stock: 1 }],
        images: [],
      })),
    );

    const result = await service.buildForCompany("company-a", "");
    expect(result.productCount).toBe(5);
    expect(result.totalActiveCount).toBe(5);
    expect(result.catalogBlock.split("\n").length).toBe(2);
  });

  it("si pide un producto sin match activo, no rellena con otros del catálogo", async () => {
    prisma.company.findUnique.mockResolvedValue({ name: "Tienda" });
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([
      {
        name: "Camiseta",
        description: null,
        updatedAt: new Date("2026-08-01"),
        category: { name: "Ropa" },
        variants: [{ sku: "C-1", name: "M", price: 20, stock: 2 }],
        images: [],
      },
    ]);

    const result = await service.buildForCompany("company-a", "quiero 3 gorras");

    expect(result.catalogBlock).toContain("ningún producto ACTIVO coincide");
    expect(result.catalogBlock).not.toContain("Camiseta");
  });

  it("en pregunta de catálogo/stock incluye productos aunque no haya match de nombre", async () => {
    prisma.company.findUnique.mockResolvedValue({ name: "Tienda" });
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([
      {
        name: "Camiseta",
        description: null,
        updatedAt: new Date("2026-08-01"),
        category: { name: "Ropa" },
        variants: [{ sku: "C-1", name: "M", price: 20, stock: 2 }],
        images: [],
      },
    ]);

    const result = await service.buildForCompany("company-a", "que productos tienen en stock?");

    expect(result.catalogBlock).toContain("Camiseta");
    expect(result.catalogBlock).not.toContain("ningún producto ACTIVO coincide");
  });
});
