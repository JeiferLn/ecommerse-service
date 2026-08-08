import { Module } from "@nestjs/common";

import { CheckoutController } from "./checkout.controller";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  controllers: [OrdersController, CheckoutController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
