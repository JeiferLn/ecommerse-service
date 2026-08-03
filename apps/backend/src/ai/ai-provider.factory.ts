import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env.validation";
import type { AiChatProvider } from "./ai.types";
import { MockChatProvider } from "./mock-chat.provider";
import { OpenRouterChatProvider } from "./openrouter-chat.provider";

@Injectable()
export class AiProviderFactory {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly openRouter: OpenRouterChatProvider,
    private readonly mock: MockChatProvider,
  ) {}

  getProvider(): AiChatProvider {
    const provider = this.config.get("AI_PROVIDER", { infer: true });
    if (provider === "mock") {
      return this.mock;
    }
    // openrouter y openai usan el mismo cliente compatible; openai cambiará base URL vía AI_BASE_URL
    return this.openRouter;
  }
}
