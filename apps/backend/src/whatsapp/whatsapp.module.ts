import { Module } from "@nestjs/common";

import { AiModule } from "../ai/ai.module";
import { KnowledgeModule } from "../knowledge/knowledge.module";
import { OrdersModule } from "../orders/orders.module";
import { TwilioWhatsAppClient } from "./twilio-whatsapp.client";
import { WhatsAppConnectionService } from "./whatsapp-connection.service";
import { WhatsAppInboxController } from "./whatsapp-inbox.controller";
import { WhatsAppInboxService } from "./whatsapp-inbox.service";
import { WhatsAppController } from "./whatsapp.controller";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";

@Module({
  imports: [AiModule, KnowledgeModule, OrdersModule],
  controllers: [WhatsAppController, WhatsAppInboxController],
  providers: [
    TwilioWhatsAppClient,
    WhatsAppConnectionService,
    WhatsAppWebhookService,
    WhatsAppInboxService,
  ],
})
export class WhatsAppModule {}
