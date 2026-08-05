import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env.validation";
import type { AiChatProvider, ChatCompletionRequest, ChatCompletionResult } from "./ai.types";

@Injectable()
export class OpenRouterChatProvider implements AiChatProvider {
  private readonly logger = new Logger(OpenRouterChatProvider.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const apiKey = this.config.get("OPENROUTER_API_KEY", { infer: true })?.trim();
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY no configurada");
    }

    const baseUrl = this.config.get("AI_BASE_URL", { infer: true }).replace(/\/$/, "");
    const model =
      request.model ?? this.config.get("AI_MODEL", { infer: true }) ?? "openrouter/free";
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

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.3,
        max_tokens: request.maxTokens ?? 400,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      this.logger.error(`OpenRouter error ${response.status}: ${errorBody.slice(0, 300)}`);
      throw new Error(`OpenRouter respondió ${response.status}`);
    }

    const data = (await response.json()) as {
      model?: string;
      choices?: Array<{
        message?: { content?: string | null | Array<{ type?: string; text?: string }> };
        text?: string;
      }>;
    };

    const rawContent = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text;
    let content = "";
    if (typeof rawContent === "string") {
      content = rawContent.trim();
    } else if (Array.isArray(rawContent)) {
      content = rawContent
        .map((part) => (typeof part?.text === "string" ? part.text : ""))
        .join("")
        .trim();
    }

    if (!content) {
      this.logger.warn(
        `OpenRouter empty content (model=${model}). keys=${JSON.stringify(Object.keys(data.choices?.[0] ?? {}))}`,
      );
      throw new Error("OpenRouter devolvió una respuesta vacía");
    }

    return {
      content,
      model: data.model ?? model,
    };
  }
}
