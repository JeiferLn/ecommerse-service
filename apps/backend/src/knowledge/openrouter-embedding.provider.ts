import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env.validation";
import type { EmbeddingProvider } from "./embedding.types";

@Injectable()
export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  private readonly logger = new Logger(OpenRouterEmbeddingProvider.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const apiKey = this.config.get("OPENROUTER_API_KEY", { infer: true })?.trim();
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY no configurada para embeddings");
    }

    const baseUrl = this.config.get("AI_BASE_URL", { infer: true }).replace(/\/$/, "");
    const model = this.config.get("EMBEDDING_MODEL", { infer: true });
    const referer = this.config.get("AI_HTTP_REFERER", { infer: true });
    const appTitle = this.config.get("AI_APP_TITLE", { infer: true });

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
    if (referer) {
      headers["HTTP-Referer"] = referer;
    }
    if (appTitle) {
      headers["X-Title"] = appTitle;
    }

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      this.logger.error(
        `OpenRouter embeddings error ${response.status}: ${errorBody.slice(0, 300)}`,
      );
      throw new Error(`OpenRouter embeddings respondió ${response.status}`);
    }

    const data = (await response.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>;
    };

    const rows = data.data ?? [];
    if (rows.length !== texts.length) {
      throw new Error("OpenRouter embeddings devolvió un número inesperado de vectores");
    }

    return rows
      .slice()
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((row) => {
        if (!row.embedding || row.embedding.length === 0) {
          throw new Error("OpenRouter embeddings devolvió un vector vacío");
        }
        return row.embedding;
      });
  }
}
