import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { KnowledgeModule } from "../knowledge/knowledge.module";
import { MailModule } from "../mail/mail.module";
import { MercadoPagoModule } from "../payments/mercadopago.module";
import { UsersModule } from "../users/users.module";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";

@Module({
  imports: [UsersModule, AuthModule, MailModule, KnowledgeModule, MercadoPagoModule, BillingModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
})
export class CompaniesModule {}
