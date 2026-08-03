import { Injectable } from "@nestjs/common";

import type { AiChatProvider, ChatCompletionRequest, ChatCompletionResult } from "./ai.types";
import { HANDOFF_MARKER } from "./ai.types";

@Injectable()
export class MockChatProvider implements AiChatProvider {
  async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const lastUser = [...request.messages].reverse().find((message) => message.role === "user");
    const text = lastUser?.content.toLowerCase() ?? "";

    if (
      text.includes("humano") ||
      text.includes("asesor") ||
      text.includes("handoff") ||
      text.includes("no hay productos")
    ) {
      return { content: HANDOFF_MARKER, model: "mock" };
    }

    const isGreeting =
      /^(hola|buenas|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|hey|saludos)\b/.test(
        text.trim(),
      ) && !/(precio|stock|producto|cat[aá]logo|tienen|cuesta|talla)/.test(text);

    if (isGreeting) {
      return {
        content:
          "¡Hola! Bienvenido a nuestra tienda. ¿En qué te puedo ayudar hoy?",
        model: "mock",
      };
    }

    const catalogHint = request.messages.find((message) => message.role === "system")?.content ?? "";
    const productMatch = catalogHint.match(/^- (.+?) \|/m);
    const productName = productMatch?.[1] ?? "nuestros productos";

    return {
      content: `¡Claro! Sobre ${productName}: según nuestro catálogo activo te puedo ayudar. ¿Quieres precio, stock o más detalles?`,
      model: "mock",
    };
  }
}
