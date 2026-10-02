import {
  cartActionButtons,
  parseActionId,
  productCardInteractive,
  productListInteractive,
  renderAsFallbackText,
  resolveTypedAction,
  type SuggestedProduct,
  WA_LIMITS,
} from "./interactive-message.util";

const shirt: SuggestedProduct = {
  id: "prod1",
  name: "Camiseta Oversize Algodón Premium",
  imageUrl: "https://cdn.example.com/shirt.jpg",
  currency: "COP",
  variants: [
    { id: "var1", name: "M", price: 50000, stock: 3 },
    { id: "var2", name: "L", price: 52000, stock: 0 },
  ],
};

describe("interactive-message.util", () => {
  it("interpreta acciones fijas y de entidad, y rechaza ids raros", () => {
    expect(parseActionId("cart:checkout")).toEqual({ type: "cart_checkout" });
    expect(parseActionId("variant:abc123")).toEqual({ type: "variant", variantId: "abc123" });
    expect(parseActionId("product:p1")).toEqual({ type: "product", productId: "p1" });
    expect(parseActionId("variant:../x")).toBeNull();
    expect(parseActionId("otra:cosa")).toBeNull();
    expect(parseActionId(null)).toBeNull();
  });

  it("la lista solo incluye variantes con stock y respeta los límites de WhatsApp", () => {
    const list = productListInteractive([shirt]);
    expect(list).toMatchObject({ kind: "list", button: "Ver productos" });
    if (list?.kind !== "list") throw new Error("esperaba lista");
    expect(list.items).toHaveLength(1);
    expect(list.items[0]!.id).toBe("variant:var1");
    expect(list.items[0]!.title.length).toBeLessThanOrEqual(WA_LIMITS.listItemTitle);
    expect(list.items[0]!.description!.length).toBeLessThanOrEqual(WA_LIMITS.listItemDescription);
  });

  it("con un producto el título es la variante; con varios, el producto", () => {
    const single = productListInteractive([shirt]);
    expect(single?.kind === "list" && single.items[0]).toMatchObject({
      title: "M",
      description: expect.stringMatching(/^Camiseta Oversize Algodón Premium · .*3 disponibles$/),
    });
    const cap: SuggestedProduct = {
      ...shirt,
      id: "prod2",
      name: "Gorra",
      variants: [{ id: "var3", name: "Única", price: 30000, stock: 1 }],
    };
    const several = productListInteractive([shirt, cap]);
    expect(several?.kind === "list" && several.items).toEqual([
      expect.objectContaining({
        title: "Camiseta Oversize Algod…",
        description: expect.stringMatching(/^M · /),
      }),
      expect.objectContaining({ title: "Gorra", description: expect.not.stringMatching(/Única/) }),
    ]);
  });

  it("la lista se corta en 10 opciones y es null sin stock", () => {
    const many: SuggestedProduct = {
      ...shirt,
      variants: Array.from({ length: 14 }, (_, i) => ({
        id: `v${i}`,
        name: `T${i}`,
        price: 1000,
        stock: 1,
      })),
    };
    const list = productListInteractive([many]);
    expect(list?.kind === "list" && list.items.length).toBe(10);
    expect(
      productListInteractive([
        { ...shirt, variants: [{ id: "x", name: "U", price: 1, stock: 0 }] },
      ]),
    ).toBeNull();
  });

  it("la tarjeta pide elegir opción si el producto tiene varias variantes", () => {
    const card = productCardInteractive(shirt);
    expect(card).toMatchObject({
      kind: "product_card",
      title: shirt.name,
      actions: [
        { id: "product:prod1", title: "Elegir opción" },
        { id: "cart:view", title: "Ver carrito" },
      ],
    });
  });

  it("la tarjeta agrega directo si hay una sola variante", () => {
    const card = productCardInteractive({ ...shirt, variants: [shirt.variants[0]!] });
    expect(card?.kind === "product_card" && card.actions[0]).toEqual({
      id: "variant:var1",
      title: "Agregar al carrito",
    });
  });

  it("el texto de respaldo numera las opciones", () => {
    const text = renderAsFallbackText("Tu carrito: …", cartActionButtons());
    expect(text).toContain("1. Confirmar pedido");
    expect(text).toContain("3. Vaciar carrito");
    expect(
      renderAsFallbackText("Pedido listo", {
        kind: "link_button",
        title: "Pagar pedido",
        url: "https://x.co/checkout/t1",
      }),
    ).toBe("Pedido listo\n\nPagar pedido: https://x.co/checkout/t1");
  });

  it("escribir el número o el título equivale a tocar la opción", () => {
    const interactive = cartActionButtons();
    expect(resolveTypedAction("1", interactive)).toBe("cart:checkout");
    expect(resolveTypedAction("  seguir comprando! ", interactive)).toBe("cart:continue");
    expect(resolveTypedAction("9", interactive)).toBeNull();
    expect(resolveTypedAction("quiero otra cosa", interactive)).toBeNull();
    expect(resolveTypedAction("1", null)).toBeNull();
  });
});
