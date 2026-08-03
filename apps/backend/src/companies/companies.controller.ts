import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  ApiResponse,
  CompanyDetails,
  CompanyInvitation,
  CompanyMember,
  InviteResult,
  RemoveMemberResult,
  AuthUser,
} from "@commerce-ai/types";
import type { Response } from "express";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { setSessionCookies } from "../common/session-cookies";
import { AuthService } from "../auth/auth.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CompaniesService } from "./companies.service";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { InviteDto } from "./dto/invite.dto";
import { SwitchCompanyDto } from "./dto/switch-company.dto";
import { UpdateCompanyCommerceDto } from "./dto/update-company-commerce.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import { UpdateMemberRoleDto } from "./dto/update-member-role.dto";

@Controller("company")
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  async createCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCompanyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<AuthUser>> {
    const company = await this.companiesService.createCompany(user.id, dto);
    const session = await this.authService.switchCompany(user.id, company.id);
    this.setSessionCookies(res, session.accessToken, session.refreshToken);
    return { status: "success", data: session.user };
  }

  @Get()
  async getCompany(@CurrentUser() user: AuthenticatedUser): Promise<ApiResponse<CompanyDetails>> {
    return {
      status: "success",
      data: await this.companiesService.getCompany(user.companyId),
    };
  }

  @Roles("owner")
  @Patch()
  async updateCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCompanyDto,
  ): Promise<ApiResponse<CompanyDetails>> {
    return {
      status: "success",
      data: await this.companiesService.updateCompany(user.companyId, dto),
      message: "Empresa actualizada",
    };
  }

  @Roles("owner")
  @Patch("commerce")
  async updateCommerce(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCompanyCommerceDto,
  ): Promise<ApiResponse<CompanyDetails>> {
    return {
      status: "success",
      data: await this.companiesService.updateCommerceSettings(user.companyId, dto),
      message: "Envíos y pagos actualizados",
    };
  }

  @Get("members")
  async members(@CurrentUser() user: AuthenticatedUser): Promise<ApiResponse<CompanyMember[]>> {
    return {
      status: "success",
      data: await this.companiesService.listMembers(user.companyId),
    };
  }

  @Roles("owner")
  @Patch("members/:userId")
  async updateMemberRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId") memberUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ): Promise<ApiResponse<CompanyMember>> {
    return {
      status: "success",
      data: await this.companiesService.updateMemberRole(user.companyId, memberUserId, dto.role),
    };
  }

  @Roles("owner")
  @Delete("members/:userId")
  async removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId") memberUserId: string,
  ): Promise<ApiResponse<RemoveMemberResult>> {
    return {
      status: "success",
      data: await this.companiesService.removeMember(user.companyId, user.id, memberUserId),
    };
  }

  @Roles("owner")
  @Post("invitations")
  async invite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteDto,
  ): Promise<ApiResponse<InviteResult>> {
    return {
      status: "success",
      data: await this.companiesService.invite(user.companyId, dto.email),
    };
  }

  @Roles("owner")
  @Get("invitations")
  async pendingInvitations(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiResponse<CompanyInvitation[]>> {
    return {
      status: "success",
      data: await this.companiesService.listPendingInvitations(user.companyId),
    };
  }

  @Roles("owner")
  @Delete("invitations/:id")
  async cancelInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<ApiResponse<InviteResult>> {
    return {
      status: "success",
      data: await this.companiesService.cancelInvitation(user.companyId, id),
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post("switch")
  async switch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SwitchCompanyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<AuthUser>> {
    const session = await this.authService.switchCompany(user.id, dto.companyId);
    this.setSessionCookies(res, session.accessToken, session.refreshToken);
    return { status: "success", data: session.user };
  }

  private setSessionCookies(res: Response, accessToken: string, refreshToken: string): void {
    const accessTtl = this.configService.getOrThrow<number>("ACCESS_TOKEN_TTL_SECONDS");
    const refreshTtl = this.configService.getOrThrow<number>("REFRESH_TOKEN_TTL_SECONDS");
    const secure = this.configService.get<boolean>("COOKIE_SECURE") ?? false;

    setSessionCookies(res, accessToken, refreshToken, {
      accessTtlSeconds: accessTtl,
      refreshTtlSeconds: refreshTtl,
      secure,
    });
  }
}
