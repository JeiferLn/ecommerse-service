import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env.validation";
import { MockEmbeddingProvider } from "./mock-embedding.provider";
import { OpenRouterEmbeddingProvider } from "./openrouter-embedding.provider";
import type { EmbeddingProvider } from "./embedding.types";

@Injectable()
export class EmbeddingProviderFactory {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly openRouter: OpenRouterEmbeddingProvider,
    private readonly mock: MockEmbeddingProvider,
  ) {}

  getProvider(): EmbeddingProvider {
    const provider = this.config.get("EMBEDDING_PROVIDER", { infer: true });
    if (provider === "mock") {
      return this.mock;
    }

    const apiKey = this.config.get("OPENROUTER_API_KEY", { infer: true })?.trim();
    if (!apiKey) {
      return this.mock;
    }

    return this.openRouter;
  }
}
