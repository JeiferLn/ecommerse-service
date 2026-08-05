import {
  buildSalesScopeRedirect,
  isClearlyOffTopicSalesQuery,
  looksLikeOffTopicAssistantReply,
} from "./sales-scope";

describe("sales-scope", () => {
  it("detecta pedidos de programación / hola mundo", () => {
    expect(isClearlyOffTopicSalesQuery("Hazme un hola mundo en python")).toBe(true);
    expect(isClearlyOffTopicSalesQuery("escríbeme un programa en javascript")).toBe(true);
    expect(isClearlyOffTopicSalesQuery("print('hola')")).toBe(true);
  });

  it("no bloquea consultas de ventas", () => {
    expect(isClearlyOffTopicSalesQuery("¿Cuánto cuesta la camiseta?")).toBe(false);
    expect(isClearlyOffTopicSalesQuery("tienen jeans?")).toBe(false);
    expect(isClearlyOffTopicSalesQuery("hola")).toBe(false);
    expect(isClearlyOffTopicSalesQuery("cuál es el código de descuento")).toBe(false);
  });

  it("detecta respuestas tipo tutorial", () => {
    expect(
      looksLikeOffTopicAssistantReply(
        "Claro! Aquí tienes:\n```python\nprint('Hola Mundo')\n```\n### ¿Cómo funciona?",
      ),
    ).toBe(true);
    expect(looksLikeOffTopicAssistantReply("La camiseta cuesta $10. ¿Quieres la talla M?")).toBe(
      false,
    );
  });

  it("arma el redirect de alcance", () => {
    expect(buildSalesScopeRedirect("Acme")).toContain("Acme");
    expect(buildSalesScopeRedirect("Acme")).toContain("catálogo");
  });
});
