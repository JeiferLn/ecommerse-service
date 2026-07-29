import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MailModule } from '../mail/mail.module';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';

@Module({
  imports: [MailModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, RolesGuard],
  exports: [CompaniesService],
})
export class CompaniesModule {}
