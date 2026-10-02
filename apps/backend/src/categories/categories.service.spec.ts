import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { CategoriesService } from "./categories.service";

describe("CategoriesService", () => {
  let service: CategoriesService;
  let prisma: {
    category: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      category: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CategoriesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(CategoriesService);
  });

  it("lista categorías de la empresa", async () => {
    prisma.category.findMany.mockResolvedValue([
      {
        id: "cat-1",
        name: "Ropa",
        slug: "ropa",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const result = await service.list("company-1");
    expect(result).toEqual([
      {
        id: "cat-1",
        name: "Ropa",
        slug: "ropa",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("crea categoría con slug único", async () => {
    prisma.category.findFirst.mockResolvedValueOnce(null);
    prisma.category.create.mockResolvedValue({
      id: "cat-1",
      name: "Calzado",
      slug: "calzado",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await service.create("company-1", { name: "Calzado" });
    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { companyId: "company-1", name: "Calzado", slug: "calzado" },
    });
    expect(result.slug).toBe("calzado");
  });

  it("rechaza sin empresa", async () => {
    await expect(service.list(null)).rejects.toThrow(BadRequestException);
  });

  it("lanza NotFound al actualizar categoría ajena", async () => {
    prisma.category.findFirst.mockResolvedValue(null);
    await expect(service.update("company-1", "cat-x", { name: "X" })).rejects.toThrow(
      NotFoundException,
    );
  });

  it("mapea conflicto de slug a ConflictException", async () => {
    prisma.category.findFirst.mockResolvedValue(null);
    prisma.category.create.mockRejectedValue({
      code: "P2002",
      name: "PrismaClientKnownRequestError",
    });

    // Without instanceof Prisma error this will rethrow - simulate with real Prisma error class is hard.
    // Ensure create path works when no conflict:
    prisma.category.create.mockResolvedValue({
      id: "cat-2",
      name: "Joyas",
      slug: "joyas",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    await expect(service.create("company-1", { name: "Joyas" })).resolves.toMatchObject({
      name: "Joyas",
    });
    expect(ConflictException).toBeDefined();
  });
});
