import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { PrismaService } from "../prisma/prisma.service";
import { AiProviderFactory } from "./ai-provider.factory";
import { AiReplyService } from "./ai-reply.service";
import { CatalogContextService } from "./catalog-context.service";
import { HANDOFF_MARKER } from "./ai.types";
import { KnowledgeRetrievalService } from "../knowledge/knowledge-retrieval.service";

describe("AiReplyService", () => {
  let service: AiReplyService;
  let catalogContext: { buildForCompany: jest.Mock };
  let knowledgeRetrieval: { retrieve: jest.Mock };
  let providerComplete: jest.Mock;
  let prisma: {
    message: { findMany: jest.Mock };
    company: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    catalogContext = {
      buildForCompany: jest.fn().mockResolvedValue({
        companyName: "Tienda",
        catalogBlock: "- Camiseta | Variantes: M ($10, stock 2)",
        categoriesSummary: "Ropa (1)",
        totalActiveCount: 1,
        productCount: 1,
        matchedProducts: [],
      }),
    };
    knowledgeRetrieval = {
      retrieve: jest.fn().mockResolvedValue({ ragBlock: "", chunks: [] }),
    };
    providerComplete = jest.fn();
    prisma = {
      message: {
        findMany: jest.fn().mockResolvedValue([
          { direction: "inbound", body: "¿Cuánto cuesta la camiseta?" },
        ]),
      },
      company: {
        findUnique: jest.fn().mockResolvedValue({
          countryCode: null,
          shippingScopes: [],
          shippingCarriers: [],
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiReplyService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === "AI_FALLBACK_TEXT") {
                return "Fallback humano";
              }
              if (key === "AI_HISTORY_LIMIT") {
                return 8;
              }
              return undefined;
            },
          },
        },
        {
          provide: AiProviderFactory,
          useValue: { getProvider: () => ({ complete: providerComplete }) },
        },
        { provide: CatalogContextService, useValue: catalogContext },
        { provide: KnowledgeRetrievalService, useValue: knowledgeRetrieval },
      ],
    }).compile();

    service = module.get(AiReplyService);
  });

  it("devuelve la respuesta del provider", async () => {
    providerComplete.mockResolvedValue({ content: "La camiseta cuesta $10", model: "mock" });

    const result = await service.generateReply({
      companyId: "c1",
      conversationId: "conv-1",
      customerText: "¿Cuánto cuesta la camiseta?",
    });

    // Preguntas de precio usan catálogo; no inyectan FAQ/RAG.
    expect(knowledgeRetrieval.retrieve).not.toHaveBeenCalled();
    expect(result).toEqual({
      text: "La camiseta cuesta $10",
      requestedHandoff: false,
      imageUrls: [],
    });
  });

  it("incluye ragBlock en el system prompt cuando hay documentos", async () => {
    knowledgeRetrieval.retrieve.mockResolvedValue({
      ragBlock: "[1] (policy) Devoluciones\nTienes 15 días para devolver.",
      chunks: [
        {
          content: "Tienes 15 días para devolver.",
          documentTitle: "Devoluciones",
          documentType: "policy",
          distance: 0.1,
        },
      ],
    });
    providerComplete.mockResolvedValue({ content: "Tienes 15 días para devolver.", model: "mock" });

    await service.generateReply({
      companyId: "c1",
      conversationId: "conv-1",
      customerText: "¿puedo devolver?",
    });

    const messages = providerComplete.mock.calls[0][0].messages as Array<{
      role: string;
      content: string;
    }>;
    expect(messages[0]?.content).toContain("Tienes 15 días para devolver.");
  });

  it("si OpenRouter falla usa fallback desde documentos RAG", async () => {
    knowledgeRetrieval.retrieve.mockResolvedValue({
      ragBlock: "[1] (warranty) Garantia\nCubre defectos de fabricación.",
      chunks: [
        {
          content: "Cubre defectos de fabricación con factura y fotos.",
          documentTitle: "Garantia",
          documentType: "warranty",
          distance: 0.2,
        },
      ],
    });
    providerComplete.mockRejectedValue(new Error("OpenRouter devolvió una respuesta vacía"));

    const result = await service.generateReply({
      companyId: "c1",
      conversationId: "conv-1",
      customerText: "llego en mal estado, como lo devuelvo?",
    });

    expect(result.requestedHandoff).toBe(false);
    expect(result.text).toContain("Garantia");
    expect(result.text).toContain("defectos");
  });

  it("marca handoff ante [HANDOFF]", async () => {
    providerComplete.mockResolvedValue({ content: HANDOFF_MARKER, model: "mock" });

    const result = await service.generateReply({
      companyId: "c1",
      conversationId: "conv-1",
      customerText: "quiero un asesor",
    });

    expect(result.requestedHandoff).toBe(true);
    expect(result.text).toBe("Fallback humano");
  });

  it("no marca handoff si el provider falla", async () => {
    providerComplete.mockRejectedValue(new Error("boom"));

    const result = await service.generateReply({
      companyId: "c1",
      conversationId: "conv-1",
      customerText: "hola",
    });

    expect(result).toEqual({
      text: "Fallback humano",
      requestedHandoff: false,
      imageUrls: [],
    });
  });

  it("marca handoff si no hay productos activos", async () => {
    catalogContext.buildForCompany.mockResolvedValue({
      companyName: "Tienda",
      catalogBlock: "",
      categoriesSummary: "",
      totalActiveCount: 0,
      productCount: 0,
      matchedProducts: [],
    });

    const result = await service.generateReply({
      companyId: "c1",
      conversationId: "conv-1",
      customerText: "hola",
    });

    expect(result.requestedHandoff).toBe(true);
    expect(providerComplete).not.toHaveBeenCalled();
  });

  it("descarta respuestas basura de safety tags", async () => {
    providerComplete.mockResolvedValue({
      content: "User Safety: safe\nResponse Safety: safe",
      model: "mock",
    });

    const result = await service.generateReply({
      companyId: "c1",
      conversationId: "conv-1",
      customerText: "qué artículos venden?",
    });

    expect(result.requestedHandoff).toBe(false);
    expect(result.text).toContain("Camiseta");
  });

  it("descarta monólogos / razonamiento interno en inglés", async () => {
    providerComplete.mockResolvedValue({
      content:
        "Wait, wait, hold on... there's a discrepancy here. Looking at the catalog: Gorras Variantes: (sku Gorras, $20000.00, stock 5). Oh no, this is a problem. The assistant previously said $30000. According to the rules I must not invent data.",
      model: "mock",
    });

    const result = await service.generateReply({
      companyId: "c1",
      conversationId: "conv-1",
      customerText: "quiero 3 gorras",
    });

    expect(result.requestedHandoff).toBe(false);
    expect(result.text).toBe("Fallback humano");
  });

  it("detecta razonamiento interno con looksLikeInternalReasoning", () => {
    expect(
      service.looksLikeInternalReasoning(
        "Wait, wait, hold on... there's a discrepancy according to the rules",
      ),
    ).toBe(true);
    expect(service.looksLikeInternalReasoning("¡Claro! Tenemos gorras a $20.000.")).toBe(false);
  });

  it("bloquea mensajes fuera del ámbito de ventas sin llamar al modelo", async () => {
    const result = await service.generateReply({
      companyId: "c1",
      conversationId: "conv-1",
      customerText: "Hazme un hola mundo en python",
    });

    expect(providerComplete).not.toHaveBeenCalled();
    expect(knowledgeRetrieval.retrieve).not.toHaveBeenCalled();
    expect(result.requestedHandoff).toBe(false);
    expect(result.text).toContain("Solo puedo ayudarte");
    expect(result.text).toContain("Tienda");
  });

  it("reemplaza tutoriales del modelo por redirect de ventas", async () => {
    providerComplete.mockResolvedValue({
      content:
        "¡Claro! Aquí tienes:\n```python\nprint('Hola Mundo')\n```\n### ¿Cómo funciona?\nLa función print muestra texto.",
      model: "mock",
    });

    const result = await service.generateReply({
      companyId: "c1",
      conversationId: "conv-1",
      customerText: "cuéntame algo interesante",
    });

    expect(result.text).toContain("Solo puedo ayudarte");
    expect(result.text).not.toContain("print");
  });
});
