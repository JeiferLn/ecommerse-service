import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ForbiddenException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { DashboardService } from "./dashboard.service";

describe("DashboardService", () => {
  let service: DashboardService;
  let prisma: {
    product: { findMany: jest.Mock; count: jest.Mock };
    category: { count: jest.Mock };
    companyMembership: { count: jest.Mock };
    company: { count: jest.Mock; findMany: jest.Mock };
    user: { count: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "p1",
            name: "Camisa",
            status: "active",
            variants: [{ stock: 2 }, { stock: 1 }],
          },
          {
            id: "p2",
            name: "Pantalón",
            status: "draft",
            variants: [{ stock: 20 }],
          },
        ]),
        count: jest.fn().mockResolvedValue(10),
      },
      category: { count: jest.fn().mockResolvedValue(3) },
      companyMembership: { count: jest.fn().mockResolvedValue(4) },
      company: {
        count: jest.fn().mockResolvedValue(5),
        findMany: jest.fn().mockResolvedValue([
          {
            id: "c1",
            name: "Acme",
            type: "retail",
            createdAt: new Date("2026-07-01T00:00:00.000Z"),
            owner: { name: "Ana", email: "ana@acme.com" },
            _count: { memberships: 2, products: 3 },
          },
        ]),
      },
      user: {
        count: jest.fn().mockResolvedValue(12),
        findMany: jest.fn().mockResolvedValue([{ createdAt: new Date() }]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DashboardService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(DashboardService);
  });

  it("agrega métricas de la empresa activa", async () => {
    const stats = await service.getCompanyStats("company-1");
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: "company-1" } }),
    );
    expect(stats.productsTotal).toBe(2);
    expect(stats.totalStock).toBe(23);
    expect(stats.variantsTotal).toBe(3);
    expect(stats.lowStockProducts.some((item) => item.id === "p1")).toBe(true);
    expect(stats.categoriesTotal).toBe(3);
    expect(stats.membersTotal).toBe(4);
  });

  it("exige empresa activa para stats de compañía", async () => {
    await expect(service.getCompanyStats(null)).rejects.toThrow(BadRequestException);
  });

  it("rechaza stats de plataforma si no es admin", async () => {
    await expect(service.getPlatformStats("owner")).rejects.toThrow(ForbiddenException);
  });

  it("devuelve agregados globales para admin", async () => {
    const stats = await service.getPlatformStats("admin");
    expect(stats.companiesTotal).toBe(5);
    expect(stats.usersTotal).toBe(12);
    expect(stats.productsTotal).toBe(10);
    expect(stats.recentCompanies[0]?.name).toBe("Acme");
    expect(stats.companiesLast30Days).toHaveLength(30);
  });
});
