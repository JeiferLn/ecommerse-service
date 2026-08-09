import { Module } from "@nestjs/common";

import { MercadoPagoModule } from "../payments/mercadopago.module";
import { PrismaModule } from "../prisma/prisma.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";

@Module({
  imports: [PrismaModule, MercadoPagoModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
