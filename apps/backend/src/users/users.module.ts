import { Module } from "@nestjs/common";

import { BillingModule } from "../billing/billing.module";
import { UsersService } from "./users.service";

@Module({
  imports: [BillingModule],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
