import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CompaniesService } from './companies.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('invitations/:token')
  getInvitation(@Param('token') token: string) {
    return this.companiesService.getInvitationByToken(token);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MEMBER)
  getMe(@CurrentUser() user: AuthUser) {
    return this.companiesService.getMyCompany(user);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.updateMyCompany(user, dto);
  }

  @Get('me/members')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MEMBER)
  listMembers(@CurrentUser() user: AuthUser) {
    return this.companiesService.listMembers(user);
  }

  @Get('me/invitations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  listInvitations(@CurrentUser() user: AuthUser) {
    return this.companiesService.listInvitations(user);
  }

  @Post('me/invitations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  createInvitation(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.companiesService.createInvitation(user, dto);
  }

  @Delete('me/invitations/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  revokeInvitation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.companiesService.revokeInvitation(user, id);
  }
}
