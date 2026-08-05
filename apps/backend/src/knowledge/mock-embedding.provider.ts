import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";

import type { Env } from "../config/env.validation";
import type { EmbeddingProvider } from "./embedding.types";

/** Embeddings deterministas para tests/dev sin API key. */
@Injectable()
export class MockEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async embed(texts: string[]): Promise<number[][]> {
    const dimensions = this.config.get("EMBEDDING_DIMENSIONS", { infer: true });
    return texts.map((text) => this.hashToVector(text, dimensions));
  }

  private hashToVector(text: string, dimensions: number): number[] {
    const normalized = text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    const vector = new Array<number>(dimensions).fill(0);
    const tokens = normalized.split(/[^a-z0-9]+/).filter((token) => token.length >= 2);

    for (const token of tokens.length > 0 ? tokens : ["empty"]) {
      const digest = createHash("sha256").update(token).digest();
      for (let i = 0; i < digest.length; i += 1) {
        const index = digest[i]! % dimensions;
        vector[index] = (vector[index] ?? 0) + ((digest[i]! % 17) - 8) / 8;
      }
    }

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map((value) => value / norm);
  }
}
