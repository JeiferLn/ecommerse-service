import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env.validation";
import { PrismaService } from "../prisma/prisma.service";
import { chunkText } from "./chunk-text";
import { EmbeddingProviderFactory } from "./embedding-provider.factory";
import { vectorToSqlLiteral } from "./embedding.types";

@Injectable()
export class KnowledgeIndexerService {
  private readonly logger = new Logger(KnowledgeIndexerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly embeddingFactory: EmbeddingProviderFactory,
  ) {}

  async reindexDocument(documentId: string): Promise<number> {
    const document = await this.prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        companyId: true,
        title: true,
        body: true,
        status: true,
      },
    });

    if (!document) {
      return 0;
    }

    await this.prisma.knowledgeChunk.deleteMany({ where: { documentId: document.id } });

    if (document.status !== "active") {
      return 0;
    }

    const chunkSize = this.config.get("RAG_CHUNK_SIZE", { infer: true });
    const overlap = this.config.get("RAG_CHUNK_OVERLAP", { infer: true });
    const pieces = chunkText(`${document.title}\n\n${document.body}`, {
      chunkSize,
      overlap,
    });

    if (pieces.length === 0) {
      return 0;
    }

    let embeddings: number[][];
    try {
      embeddings = await this.embeddingFactory.getProvider().embed(pieces);
    } catch (error) {
      this.logger.error(`Falló embedding al indexar ${document.id}: ${String(error)}`);
      throw error;
    }

    for (let index = 0; index < pieces.length; index += 1) {
      const content = pieces[index]!;
      const embedding = embeddings[index];
      const chunk = await this.prisma.knowledgeChunk.create({
        data: {
          documentId: document.id,
          companyId: document.companyId,
          content,
          chunkIndex: index,
        },
      });

      if (embedding) {
        await this.prisma.$executeRawUnsafe(
          `UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`,
          vectorToSqlLiteral(embedding),
          chunk.id,
        );
      }
    }

    return pieces.length;
  }
}
