import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { KnowledgeIndexerService } from "./knowledge-indexer.service";
import { KnowledgeService } from "./knowledge.service";
import * as pdfText from "./pdf-text";

jest.mock("./pdf-text", () => ({
  extractTextFromPdf: jest.fn(),
  assertPdfBuffer: jest.fn(),
}));

describe("KnowledgeService", () => {
  let service: KnowledgeService;
  let prisma: {
    knowledgeDocument: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
    };
  };
  let indexer: { reindexDocument: jest.Mock };
  let storage: { uploadKnowledgePdf: jest.Mock; deleteObject: jest.Mock };

  beforeEach(async () => {
    prisma = {
      knowledgeDocument: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
    };
    indexer = { reindexDocument: jest.fn().mockResolvedValue(2) };
    storage = {
      uploadKnowledgePdf: jest.fn().mockResolvedValue({
        key: "companies/company-a/knowledge/faq/uuid.pdf",
        url: "http://localhost/uploads/companies/company-a/knowledge/faq/uuid.pdf",
      }),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    (pdfText.extractTextFromPdf as jest.Mock).mockResolvedValue(
      "Texto de FAQ suficiente para indexar el documento de conocimiento de la tienda.",
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeService,
        { provide: PrismaService, useValue: prisma },
        { provide: KnowledgeIndexerService, useValue: indexer },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();

    service = module.get(KnowledgeService);
  });

  it("lista los 4 slots aunque no haya documentos", async () => {
    prisma.knowledgeDocument.findMany.mockResolvedValue([]);

    const slots = await service.listSlots("company-a");

    expect(slots).toHaveLength(4);
    expect(slots.map((slot) => slot.type)).toEqual(["guide", "faq", "warranty", "policy"]);
    expect(slots.every((slot) => !slot.uploaded)).toBe(true);
  });

  it("isConfigured es false sin los 4 PDFs activos", async () => {
    prisma.knowledgeDocument.findMany.mockResolvedValue([
      { type: "faq", status: "active", fileKey: "k1" },
      { type: "guide", status: "active", fileKey: "k2" },
    ]);

    await expect(service.isConfigured("company-a")).resolves.toBe(false);
    await expect(service.getMissingTypes("company-a")).resolves.toEqual(["warranty", "policy"]);
  });

  it("isConfigured es true con los 4 PDFs activos", async () => {
    prisma.knowledgeDocument.findMany.mockResolvedValue([
      { type: "guide", status: "active", fileKey: "g" },
      { type: "faq", status: "active", fileKey: "f" },
      { type: "warranty", status: "active", fileKey: "w" },
      { type: "policy", status: "active", fileKey: "p" },
    ]);

    await expect(service.isConfigured("company-a")).resolves.toBe(true);
  });

  it("docs sin fileKey no cuentan como configurados", async () => {
    prisma.knowledgeDocument.findMany.mockResolvedValue([
      { type: "guide", status: "active", fileKey: null },
      { type: "faq", status: "active", fileKey: "f" },
      { type: "warranty", status: "active", fileKey: "w" },
      { type: "policy", status: "active", fileKey: "p" },
    ]);

    await expect(service.isConfigured("company-a")).resolves.toBe(false);
  });

  it("sube PDF, upsert por tipo y reindexa", async () => {
    prisma.knowledgeDocument.findUnique.mockResolvedValue(null);
    prisma.knowledgeDocument.upsert.mockResolvedValue({
      id: "d-faq",
      type: "faq",
    });
    prisma.knowledgeDocument.findMany.mockResolvedValue([
      {
        id: "d-faq",
        type: "faq",
        status: "active",
        fileKey: "companies/company-a/knowledge/faq/uuid.pdf",
        fileName: "faq.pdf",
        updatedAt: new Date("2026-08-05"),
        _count: { chunks: 2 },
      },
    ]);

    const file = {
      buffer: Buffer.from("%PDF-1.4 fake"),
      originalname: "faq.pdf",
    } as Express.Multer.File;

    const slot = await service.uploadPdf("company-a", "faq", file);

    expect(storage.uploadKnowledgePdf).toHaveBeenCalled();
    expect(indexer.reindexDocument).toHaveBeenCalledWith("d-faq");
    expect(slot.uploaded).toBe(true);
    expect(slot.type).toBe("faq");
  });

  it("rechaza tipo inválido", async () => {
    await expect(
      service.uploadPdf("company-a", "other", {
        buffer: Buffer.from("%PDF"),
        originalname: "x.pdf",
      } as Express.Multer.File),
    ).rejects.toThrow(BadRequestException);
  });

  it("propaga error si el PDF no tiene texto", async () => {
    (pdfText.extractTextFromPdf as jest.Mock).mockRejectedValue(
      new BadRequestException(
        "El PDF no tiene texto suficiente. Usa un PDF con texto seleccionable (no escaneado).",
      ),
    );

    await expect(
      service.uploadPdf("company-a", "faq", {
        buffer: Buffer.from("%PDF-1.4"),
        originalname: "scan.pdf",
      } as Express.Multer.File),
    ).rejects.toThrow(/texto suficiente/);
  });
});
