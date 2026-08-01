import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { UsersModule } from "../users/users.module";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";

@Module({
  imports: [UsersModule, AuthModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
})
export class CompaniesModule {}
