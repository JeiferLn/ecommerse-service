import {
  botOfferedAddToCart,
  detectsAffirmativeCartConfirm,
  resolveOrderChatIntent,
} from "./order-intent";

describe("order-intent", () => {
  it("detecta ver carrito", () => {
    expect(resolveOrderChatIntent("ver carrito")?.type).toBe("view_cart");
    expect(resolveOrderChatIntent("mi carrito")?.type).toBe("view_cart");
  });

  it("detecta vaciar y confirmar", () => {
    expect(resolveOrderChatIntent("vaciar carrito")?.type).toBe("clear_cart");
    expect(resolveOrderChatIntent("confirmar pedido")?.type).toBe("checkout");
  });

  it("detecta agregar y pedir natural", () => {
    expect(resolveOrderChatIntent("agregar camisa al carrito")?.type).toBe("add_to_cart");
    expect(resolveOrderChatIntent("agregar gorras colombianas")?.type).toBe("add_to_cart");
    expect(resolveOrderChatIntent("me gustaria pedir una")?.type).toBe("add_to_cart");
    expect(resolveOrderChatIntent("quiero pedir una")?.type).toBe("add_to_cart");
    expect(resolveOrderChatIntent("dame una")?.type).toBe("add_to_cart");
    expect(resolveOrderChatIntent("quiero 2 por favor")?.type).toBe("add_to_cart");
    expect(resolveOrderChatIntent("quiero dos")?.type).toBe("add_to_cart");
    expect(resolveOrderChatIntent("tienen articulos relacionados con colombia")).toBeNull();
    expect(resolveOrderChatIntent("hola")).toBeNull();
  });

  it("no trata consultas de catálogo como agregar al carrito", () => {
    expect(resolveOrderChatIntent("Quiero una gorra, cuales tienes disponibles?")).toBeNull();
    expect(resolveOrderChatIntent("quiero una gorra cuales tienes")).toBeNull();
    expect(resolveOrderChatIntent("tienen gorras?")).toBeNull();
    expect(resolveOrderChatIntent("me interesa una gorra")).toBeNull();
    expect(resolveOrderChatIntent("busco gorras disponibles")).toBeNull();
  });

  it("detecta confirmación afirmativa y oferta del bot", () => {
    expect(detectsAffirmativeCartConfirm("si por favor")).toBe(true);
    expect(detectsAffirmativeCartConfirm("si por favor, no comprare nada mas")).toBe(true);
    expect(detectsAffirmativeCartConfirm("dale")).toBe(true);
    expect(detectsAffirmativeCartConfirm("confirmar pedido")).toBe(false);
    expect(
      botOfferedAddToCart(
        "Las gorras colombianas cuestan $30000. ¿Quieres que te agregue 2 al carrito?",
      ),
    ).toBe(true);
    expect(botOfferedAddToCart("Perfecto, agregaremos 2 gorras a tu carrito.")).toBe(true);
    expect(botOfferedAddToCart("Hola, ¿en qué te ayudo?")).toBe(false);
  });
});
