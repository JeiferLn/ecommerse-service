export const EMBEDDING_TOKEN = Symbol("EMBEDDING_PROVIDER");

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

export function vectorToSqlLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
