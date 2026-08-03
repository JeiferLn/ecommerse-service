import { Module } from "@nestjs/common";

import { WhatsAppCloudClient } from "./whatsapp-cloud.client";
import { WhatsAppConnectionService } from "./whatsapp-connection.service";
import { WhatsAppInboxController } from "./whatsapp-inbox.controller";
import { WhatsAppInboxService } from "./whatsapp-inbox.service";
import { WhatsAppController } from "./whatsapp.controller";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";

@Module({
  controllers: [WhatsAppController, WhatsAppInboxController],
  providers: [
    WhatsAppCloudClient,
    WhatsAppConnectionService,
    WhatsAppWebhookService,
    WhatsAppInboxService,
  ],
})
export class WhatsAppModule {}
