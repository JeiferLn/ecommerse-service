import { Module } from "@nestjs/common";

import { MercadoPagoConnectionService } from "./mercadopago-connection.service";
import { MercadoPagoService } from "./mercadopago.service";

@Module({
  providers: [MercadoPagoConnectionService, MercadoPagoService],
  exports: [MercadoPagoConnectionService, MercadoPagoService],
})
export class MercadoPagoModule {}
