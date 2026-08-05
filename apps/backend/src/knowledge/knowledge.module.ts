import { Module } from "@nestjs/common";

import { EmbeddingProviderFactory } from "./embedding-provider.factory";
import { KnowledgeController } from "./knowledge.controller";
import { KnowledgeIndexerService } from "./knowledge-indexer.service";
import { KnowledgeRetrievalService } from "./knowledge-retrieval.service";
import { KnowledgeService } from "./knowledge.service";
import { MockEmbeddingProvider } from "./mock-embedding.provider";
import { OpenRouterEmbeddingProvider } from "./openrouter-embedding.provider";

@Module({
  controllers: [KnowledgeController],
  providers: [
    OpenRouterEmbeddingProvider,
    MockEmbeddingProvider,
    EmbeddingProviderFactory,
    KnowledgeIndexerService,
    KnowledgeRetrievalService,
    KnowledgeService,
  ],
  exports: [KnowledgeRetrievalService, EmbeddingProviderFactory, KnowledgeService],
})
export class KnowledgeModule {}
