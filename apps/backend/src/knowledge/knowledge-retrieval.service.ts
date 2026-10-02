import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env.validation";
import { PrismaService } from "../prisma/prisma.service";
import { EmbeddingProviderFactory } from "./embedding-provider.factory";
import { vectorToSqlLiteral } from "./embedding.types";

export interface RetrievedChunk {
  content: string;
  documentTitle: string;
  documentType: string;
  distance: number;
}

@Injectable()
export class KnowledgeRetrievalService {
  private readonly logger = new Logger(KnowledgeRetrievalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly embeddingFactory: EmbeddingProviderFactory,
  ) {}

  async retrieve(
    companyId: string,
    query: string,
  ): Promise<{
    ragBlock: string;
    chunks: RetrievedChunk[];
  }> {
    const trimmed = query.trim();
    if (!trimmed) {
      return { ragBlock: "", chunks: [] };
    }

    const topK = this.config.get("RAG_TOP_K", { infer: true });

    try {
      const [queryEmbedding] = await this.embeddingFactory.getProvider().embed([trimmed]);
      if (!queryEmbedding) {
        return { ragBlock: "", chunks: [] };
      }

      const literal = vectorToSqlLiteral(queryEmbedding);
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{
          content: string;
          documentTitle: string;
          documentType: string;
          distance: number;
        }>
      >(
        `
        SELECT
          c."content" AS content,
          d."title" AS "documentTitle",
          d."type"::text AS "documentType",
          (c."embedding" <=> $1::vector) AS distance
        FROM "KnowledgeChunk" c
        INNER JOIN "KnowledgeDocument" d ON d."id" = c."documentId"
        WHERE c."companyId" = $2
          AND d."status" = 'active'
          AND c."embedding" IS NOT NULL
        ORDER BY c."embedding" <=> $1::vector
        LIMIT $3
        `,
        literal,
        companyId,
        topK,
      );

      // Descarta chunks muy lejanos (cosine distance ~1 = ortogonal).
      const chunks = rows
        .filter((row) => Number(row.distance) <= 0.72)
        .map((row) => ({
          content: row.content,
          documentTitle: row.documentTitle,
          documentType: row.documentType,
          distance: Number(row.distance),
        }));

      if (chunks.length === 0) {
        const lexical = await this.lexicalFallback(companyId, trimmed, topK);
        return {
          ragBlock: this.formatRagBlock(lexical),
          chunks: lexical,
        };
      }

      return {
        ragBlock: this.formatRagBlock(chunks),
        chunks,
      };
    } catch (error) {
      this.logger.warn(`RAG retrieve falló, usando fallback léxico: ${String(error)}`);
      const lexical = await this.lexicalFallback(companyId, trimmed, topK);
      return {
        ragBlock: this.formatRagBlock(lexical),
        chunks: lexical,
      };
    }
  }

  private async lexicalFallback(
    companyId: string,
    query: string,
    topK: number,
  ): Promise<RetrievedChunk[]> {
    const baseTokens = query
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3);

    const synonymGroups: string[][] = [
      ["devolver", "devolucion", "devoluciones", "cambio", "cambios", "reembolso"],
      ["garantia", "garantias", "defectuoso", "danado", "roto", "falla", "mal"],
      ["envio", "envios", "entrega", "despacho", "nacional"],
      ["horario", "horarios", "atencion", "atienden"],
      ["pago", "pagos", "factura", "facturacion"],
    ];

    const tokens = new Set(baseTokens);
    for (const token of baseTokens) {
      for (const group of synonymGroups) {
        if (group.includes(token)) {
          for (const related of group) {
            tokens.add(related);
          }
        }
      }
    }

    // Heurística: preguntas de devolución/daño también buscan docs de garantía/política.
    const normalizedQuery = query
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (/(devolv|cambio|garant|danad|defect|mal estado|roto)/.test(normalizedQuery)) {
      for (const related of synonymGroups[0]!) {
        tokens.add(related);
      }
      for (const related of synonymGroups[1]!) {
        tokens.add(related);
      }
    }

    const tokenList = [...tokens].slice(0, 16);
    if (tokenList.length === 0) {
      return [];
    }

    const documents = await this.prisma.knowledgeDocument.findMany({
      where: { companyId, status: "active" },
      select: {
        title: true,
        type: true,
        chunks: {
          select: { content: true },
          orderBy: { chunkIndex: "asc" },
        },
      },
      take: 50,
    });

    const scored: RetrievedChunk[] = [];
    for (const document of documents) {
      const titleHaystack = `${document.title} ${document.type}`
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      for (const chunk of document.chunks) {
        const haystack = `${titleHaystack} ${chunk.content}`
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const hits = tokenList.reduce(
          (count, token) => (haystack.includes(token) ? count + 1 : count),
          0,
        );
        if (hits > 0) {
          scored.push({
            content: chunk.content,
            documentTitle: document.title,
            documentType: document.type,
            distance: 1 - hits / tokenList.length,
          });
        }
      }
    }

    return scored.sort((a, b) => a.distance - b.distance).slice(0, topK);
  }

  private formatRagBlock(chunks: RetrievedChunk[]): string {
    if (chunks.length === 0) {
      return "";
    }
    return chunks
      .map(
        (chunk, index) =>
          `[${index + 1}] (${chunk.documentType}) ${chunk.documentTitle}\n${chunk.content}`,
      )
      .join("\n\n");
  }
}
