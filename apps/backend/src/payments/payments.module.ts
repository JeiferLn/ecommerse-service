import { Module, forwardRef } from "@nestjs/common";

import { OrdersModule } from "../orders/orders.module";
import { PrismaModule } from "../prisma/prisma.module";
import { TwilioWhatsAppClient } from "../whatsapp/twilio-whatsapp.client";
import { MercadoPagoModule } from "./mercadopago.module";
import { MercadoPagoWebhookService } from "./mercadopago-webhook.service";
import { PaymentsController } from "./payments.controller";

@Module({
  imports: [MercadoPagoModule, forwardRef(() => OrdersModule), PrismaModule],
  controllers: [PaymentsController],
  providers: [MercadoPagoWebhookService, TwilioWhatsAppClient],
  exports: [MercadoPagoModule],
})
export class PaymentsModule {}
