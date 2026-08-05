import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Decimal } from "@prisma/client/runtime/library";

import type { Env } from "../config/env.validation";
import { PrismaService } from "../prisma/prisma.service";

export interface CatalogContextResult {
  companyName: string;
  catalogBlock: string;
  categoriesSummary: string;
  totalActiveCount: number;
  productCount: number;
}

@Injectable()
export class CatalogContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async buildForCompany(companyId: string, customerText: string): Promise<CatalogContextResult> {
    const maxProducts = this.config.get("AI_MAX_PRODUCTS", { infer: true });
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });

    const totalActiveCount = await this.prisma.product.count({
      where: { companyId, status: "active" },
    });

    const products = await this.prisma.product.findMany({
      where: { companyId, status: "active" },
      include: {
        category: { select: { name: true } },
        variants: {
          select: { sku: true, name: true, price: true, stock: true, attributes: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: Math.max(maxProducts * 3, maxProducts),
    });

    const categoryCounts = new Map<string, number>();
    for (const product of products) {
      const key = product.category?.name ?? "Sin categoría";
      categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1);
    }
    const categoriesSummary = [...categoryCounts.entries()]
      .map(([name, count]) => `${name} (${count})`)
      .join(", ");

    const tokens = this.expandSynonyms(this.tokenize(customerText));
    const scored = products
      .map((product) => ({
        product,
        score: this.scoreProduct(product, tokens),
      }))
      .sort(
        (a, b) =>
          b.score - a.score || b.product.updatedAt.getTime() - a.product.updatedAt.getTime(),
      );

    // Para preguntas generales de catálogo, basta con pocos ejemplos; si hay match, prioriza esos.
    const overviewAsk = this.isCatalogOverviewQuestion(customerText);
    const detailLimit = overviewAsk ? Math.min(5, maxProducts) : maxProducts;
    const hasMatch = tokens.length > 0 && scored.some((item) => item.score > 0);
    const productIntent = this.looksLikeProductIntent(customerText);

    let selected: typeof scored;
    let unmatchedNote = "";

    if (hasMatch) {
      selected = scored.filter((item) => item.score > 0).slice(0, detailLimit);
    } else if (overviewAsk) {
      // "¿qué productos tienen / en stock?" → mostrar ejemplos del catálogo, no vacío.
      selected = scored.slice(0, detailLimit);
    } else if (productIntent && tokens.length > 0) {
      // No rellenar con productos ajenos: evita inventar stock desde el historial.
      selected = [];
      unmatchedNote =
        "AVISO: ningún producto ACTIVO coincide con lo que pide el cliente. " +
        "Di con claridad que ahora mismo no está disponible. " +
        "NO uses precios ni stock del historial de chat.";
    } else {
      selected = scored.slice(0, detailLimit);
    }

    const lines = selected.map(({ product }) => this.formatProductLine(product));
    const catalogBlock = [unmatchedNote, ...lines].filter(Boolean).join("\n");

    return {
      companyName: company?.name ?? "la tienda",
      catalogBlock,
      categoriesSummary,
      totalActiveCount,
      productCount: totalActiveCount,
    };
  }

  /** Heurística: el cliente habla de comprar / stock / un artículo, no solo saluda. */
  private looksLikeProductIntent(text: string): boolean {
    const normalized = text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return /(precio|cuanto|cuesta|stock|disponible|tienen|quiero|quisiera|llevar|compra|producto|talla|unidad|unidades|\d+\s*(de|unidades)?)/.test(
      normalized,
    );
  }

  private isCatalogOverviewQuestion(text: string): boolean {
    const normalized = text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return /(que venden|que tienen|que articulos|que productos|catalogo|que ofecen|que ofrecen|en stock|disponibles|que hay|que ofrecen)/.test(
      normalized,
    );
  }

  private formatProductLine(product: {
    name: string;
    description: string | null;
    category: { name: string } | null;
    variants: Array<{
      sku: string;
      name: string;
      price: Decimal;
      stock: number;
      attributes: unknown;
    }>;
  }): string {
    const variants = product.variants
      .map((variant) => {
        const attrs =
          variant.attributes &&
          typeof variant.attributes === "object" &&
          !Array.isArray(variant.attributes)
            ? Object.entries(variant.attributes as Record<string, unknown>)
                .map(([key, value]) => `${key}: ${String(value)}`)
                .join(", ")
            : "";
        const attrsPart = attrs ? `, attrs: ${attrs}` : "";
        return `${variant.name} (sku ${variant.sku}, $${this.formatPrice(variant.price)}, stock ${variant.stock}${attrsPart})`;
      })
      .join("; ");
    const category = product.category?.name ? ` [${product.category.name}]` : "";
    const description = product.description
      ? ` — ${product.description.slice(0, 160).replace(/\s+/g, " ").trim()}`
      : "";
    return `- ${product.name}${category}${description} | Variantes: ${variants || "ninguna"}`;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3);
  }

  /** Amplía tokens con familias cercanas (jeans ↔ pantalones, etc.) para ranking del contexto. */
  private expandSynonyms(tokens: string[]): string[] {
    const families: string[][] = [
      ["jean", "jeans", "pantalon", "pantalones", "capri", "capris", "jogger", "joggers"],
      ["gorra", "gorras", "gorro", "gorros", "cachucha", "cachuchas"],
      ["camisa", "camisas", "camiseta", "camisetas", "polo", "polos"],
      ["zapato", "zapatos", "tenis", "zapatilla", "zapatillas"],
    ];
    const expanded = new Set(tokens);
    for (const token of tokens) {
      for (const family of families) {
        if (family.includes(token)) {
          for (const related of family) {
            expanded.add(related);
          }
        }
      }
    }
    return [...expanded];
  }

  private scoreProduct(
    product: {
      name: string;
      description: string | null;
      category: { name: string } | null;
      variants: Array<{ sku: string; name: string }>;
    },
    tokens: string[],
  ): number {
    if (tokens.length === 0) {
      return 0;
    }
    const haystack = [
      product.name,
      product.description ?? "",
      product.category?.name ?? "",
      ...product.variants.flatMap((variant) => [variant.sku, variant.name]),
    ]
      .join(" ")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return tokens.reduce((score, token) => (haystack.includes(token) ? score + 1 : score), 0);
  }

  private formatPrice(price: Decimal): string {
    return Number(price).toFixed(2);
  }
}
