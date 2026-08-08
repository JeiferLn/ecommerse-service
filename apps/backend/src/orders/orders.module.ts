import { Module } from "@nestjs/common";

import { MercadoPagoModule } from "../payments/mercadopago.module";
import { TwilioWhatsAppClient } from "../whatsapp/twilio-whatsapp.client";
import { CheckoutController } from "./checkout.controller";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [MercadoPagoModule],
  controllers: [OrdersController, CheckoutController],
  providers: [OrdersService, TwilioWhatsAppClient],
  exports: [OrdersService],
})
export class OrdersModule {}
