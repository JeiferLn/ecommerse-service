import { Module } from "@nestjs/common";

import { AiModule } from "../ai/ai.module";
import { BillingModule } from "../billing/billing.module";
import { KnowledgeModule } from "../knowledge/knowledge.module";
import { OrdersModule } from "../orders/orders.module";
import { AdminWhatsAppController } from "./admin-whatsapp.controller";
import { AssistantPlaygroundController } from "./assistant-playground.controller";
import { AssistantPlaygroundService } from "./assistant-playground.service";
import { TwilioWhatsAppClient } from "./twilio-whatsapp.client";
import { WhatsAppConnectionService } from "./whatsapp-connection.service";
import { WhatsAppInboxController } from "./whatsapp-inbox.controller";
import { WhatsAppInboxService } from "./whatsapp-inbox.service";
import { WhatsAppController } from "./whatsapp.controller";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";

@Module({
  imports: [AiModule, KnowledgeModule, OrdersModule, BillingModule],
  controllers: [
    WhatsAppController,
    WhatsAppInboxController,
    AdminWhatsAppController,
    AssistantPlaygroundController,
  ],
  providers: [
    TwilioWhatsAppClient,
    WhatsAppConnectionService,
    WhatsAppWebhookService,
    WhatsAppInboxService,
    AssistantPlaygroundService,
  ],
  exports: [WhatsAppInboxService, TwilioWhatsAppClient, WhatsAppConnectionService],
})
export class WhatsAppModule {}
