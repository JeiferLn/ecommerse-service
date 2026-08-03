import { Module } from "@nestjs/common";

import { AiProviderFactory } from "./ai-provider.factory";
import { AiReplyService } from "./ai-reply.service";
import { CatalogContextService } from "./catalog-context.service";
import { MockChatProvider } from "./mock-chat.provider";
import { OpenRouterChatProvider } from "./openrouter-chat.provider";

@Module({
  providers: [
    OpenRouterChatProvider,
    MockChatProvider,
    AiProviderFactory,
    CatalogContextService,
    AiReplyService,
  ],
  exports: [AiReplyService],
})
export class AiModule {}
