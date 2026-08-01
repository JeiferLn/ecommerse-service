import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AuthModule } from "./auth/auth.module";
import { CompaniesModule } from "./companies/companies.module";
import { validateEnv } from "./config/env.validation";
import { HealthModule } from "./health/health.module";
import { MailModule } from "./mail/mail.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    MailModule,
    CompaniesModule,
  ],
})
export class AppModule {}
