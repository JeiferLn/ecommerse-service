import type {
  InteractiveAction,
  InteractiveListItem,
  MessageInteractive,
} from "@commerce-ai/types";

/** Límites de WhatsApp para mensajes interactivos de sesión (sin plantilla aprobada). */
export const WA_LIMITS = {
  body: 1024,
  maxButtons: 3,
  buttonTitle: 20,
  listButton: 20,
  maxListItems: 10,
  listItemTitle: 24,
  listItemDescription: 72,
} as const;

export const ACTION_IDS = {
  handlerBot: "handler:bot",
  handlerHuman: "handler:human",
  cartCheckout: "cart:checkout",
  cartContinue: "cart:continue",
  cartClear: "cart:clear",
  cartView: "cart:view",
  addYes: "add:yes",
  addNo: "add:no",
} as const;

export type ParsedAction =
  | { type: "handler_bot" }
  | { type: "handler_human" }
  | { type: "cart_checkout" }
  | { type: "cart_continue" }
  | { type: "cart_clear" }
  | { type: "cart_view" }
  | { type: "add_yes" }
  | { type: "add_no" }
  | { type: "variant"; variantId: string }
  | { type: "product"; productId: string };

const FIXED_ACTIONS: Record<string, ParsedAction> = {
  [ACTION_IDS.handlerBot]: { type: "handler_bot" },
  [ACTION_IDS.handlerHuman]: { type: "handler_human" },
  [ACTION_IDS.cartCheckout]: { type: "cart_checkout" },
  [ACTION_IDS.cartContinue]: { type: "cart_continue" },
  [ACTION_IDS.cartClear]: { type: "cart_clear" },
  [ACTION_IDS.cartView]: { type: "cart_view" },
  [ACTION_IDS.addYes]: { type: "add_yes" },
  [ACTION_IDS.addNo]: { type: "add_no" },
};

const ENTITY_ID = /^[a-z0-9_-]{1,64}$/i;

export function parseActionId(actionId: string | null | undefined): ParsedAction | null {
  const id = actionId?.trim();
  if (!id) {
    return null;
  }
  const fixed = FIXED_ACTIONS[id];
  if (fixed) {
    return fixed;
  }
  const [prefix, value] = id.split(":", 2);
  if (!value || !ENTITY_ID.test(value)) {
    return null;
  }
  if (prefix === "variant") {
    return { type: "variant", variantId: value };
  }
  if (prefix === "product") {
    return { type: "product", productId: value };
  }
  return null;
}

/** Producto sugerido por la IA con lo necesario para listas y tarjetas. */
export interface SuggestedProduct {
  id: string;
  name: string;
  imageUrl: string | null;
  currency: string;
  variants: { id: string; name: string; price: number; stock: number }[];
}

export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function buttons(actions: InteractiveAction[]): MessageInteractive {
  return {
    kind: "buttons",
    actions: actions.slice(0, WA_LIMITS.maxButtons).map((action) => ({
      id: action.id,
      title: truncate(action.title, WA_LIMITS.buttonTitle),
    })),
  };
}

export function handlerChoiceButtons(): MessageInteractive {
  return buttons([
    { id: ACTION_IDS.handlerBot, title: "Asistente virtual" },
    { id: ACTION_IDS.handlerHuman, title: "Un asesor" },
  ]);
}

export function cartActionButtons(): MessageInteractive {
  return buttons([
    { id: ACTION_IDS.cartCheckout, title: "Confirmar pedido" },
    { id: ACTION_IDS.cartContinue, title: "Seguir comprando" },
    { id: ACTION_IDS.cartClear, title: "Vaciar carrito" },
  ]);
}

export function addConfirmButtons(): MessageInteractive {
  return buttons([
    { id: ACTION_IDS.addYes, title: "Sí, agregar" },
    { id: ACTION_IDS.addNo, title: "No, gracias" },
  ]);
}

/** Lista de variantes en stock (máximo 10). Null si no hay ninguna disponible. */
export function productListInteractive(
  products: SuggestedProduct[],
  button = "Ver productos",
): MessageInteractive | null {
  const items: InteractiveListItem[] = [];
  // Con un solo producto el título es la variante ("Producto · Talla M" no cabe en 24) y el producto va en la descripción.
  const singleProduct = products.length === 1;
  for (const product of products) {
    const inStock = product.variants.filter((variant) => variant.stock > 0);
    const multiVariant = product.variants.length > 1;
    for (const variant of inStock) {
      if (items.length >= WA_LIMITS.maxListItems) {
        break;
      }
      const stockText = `${formatMoney(variant.price, product.currency)} · ${variant.stock} disponibles`;
      items.push({
        id: `variant:${variant.id}`,
        title: truncate(
          singleProduct && multiVariant ? variant.name : product.name,
          WA_LIMITS.listItemTitle,
        ),
        description: truncate(
          multiVariant
            ? `${singleProduct ? product.name : variant.name} · ${stockText}`
            : stockText,
          WA_LIMITS.listItemDescription,
        ),
      });
    }
  }
  if (items.length === 0) {
    return null;
  }
  return { kind: "list", button: truncate(button, WA_LIMITS.listButton), items };
}

/** Tarjeta de un producto con sus acciones. Null si no tiene stock. */
export function productCardInteractive(product: SuggestedProduct): MessageInteractive | null {
  const inStock = product.variants.filter((variant) => variant.stock > 0);
  if (inStock.length === 0) {
    return null;
  }
  const prices = inStock.map((variant) => variant.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const price =
    min === max
      ? formatMoney(min, product.currency)
      : `Desde ${formatMoney(min, product.currency)}`;
  const stock = inStock.reduce((sum, variant) => sum + variant.stock, 0);
  const single = inStock.length === 1 && product.variants.length === 1;
  const primary: InteractiveAction = single
    ? { id: `variant:${inStock[0]!.id}`, title: "Agregar al carrito" }
    : { id: `product:${product.id}`, title: "Elegir opción" };

  return {
    kind: "product_card",
    imageUrl: product.imageUrl,
    title: product.name,
    subtitle: `${price} · ${stock} disponibles`,
    actions: [primary, { id: ACTION_IDS.cartView, title: "Ver carrito" }],
  };
}

export function checkoutLinkButton(url: string | null): MessageInteractive {
  return { kind: "link_button", title: "Pagar pedido", url };
}

function optionsOf(interactive: MessageInteractive): InteractiveAction[] {
  switch (interactive.kind) {
    case "buttons":
    case "product_card":
      return interactive.actions;
    case "list":
      return interactive.items.map((item) => ({ id: item.id, title: item.title }));
    default:
      return [];
  }
}

/** Mismo mensaje en texto plano, para cuando no se puede enviar lo interactivo. */
export function renderAsFallbackText(body: string, interactive: MessageInteractive | null): string {
  if (!interactive) {
    return body;
  }
  if (interactive.kind === "link_button") {
    return interactive.url ? `${body}\n\n${interactive.title}: ${interactive.url}` : body;
  }
  const lines: string[] = [];
  if (interactive.kind === "product_card") {
    lines.push(`*${interactive.title}*`, interactive.subtitle);
  }
  if (interactive.kind === "list") {
    interactive.items.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.title}${item.description ? ` — ${item.description}` : ""}`);
    });
  } else {
    optionsOf(interactive).forEach((action, index) => {
      lines.push(`${index + 1}. ${action.title}`);
    });
  }
  if (lines.length === 0) {
    return body;
  }
  return [body, lines.join("\n"), "Responde con el número o el nombre de la opción."]
    .filter(Boolean)
    .join("\n\n");
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s·]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "2" o el título exacto de una opción del último mensaje interactivo → su acción. */
export function resolveTypedAction(
  text: string,
  interactive: MessageInteractive | null,
): string | null {
  if (!interactive) {
    return null;
  }
  const options = optionsOf(interactive);
  if (options.length === 0) {
    return null;
  }
  const typed = normalize(text);
  if (/^\d{1,2}$/.test(typed)) {
    return options[Number(typed) - 1]?.id ?? null;
  }
  return options.find((option) => normalize(option.title) === typed)?.id ?? null;
}
