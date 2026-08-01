import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiResponse, CompanyMember, InviteResult, AuthUser } from "@commerce-ai/types";
import type { Response } from "express";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { setSessionCookies } from "../common/session-cookies";
import { AuthService } from "../auth/auth.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CompaniesService } from "./companies.service";
import { InviteDto } from "./dto/invite.dto";
import { SwitchCompanyDto } from "./dto/switch-company.dto";

@Controller("company")
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get("members")
  async members(@CurrentUser() user: AuthenticatedUser): Promise<ApiResponse<CompanyMember[]>> {
    return {
      status: "success",
      data: await this.companiesService.listMembers(user.companyId),
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

  @HttpCode(HttpStatus.OK)
  @Post("switch")
  async switch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SwitchCompanyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<AuthUser>> {
    const session = await this.authService.switchCompany(user.id, dto.companyId);

    const accessTtl = this.configService.getOrThrow<number>("ACCESS_TOKEN_TTL_SECONDS");
    const refreshTtl = this.configService.getOrThrow<number>("REFRESH_TOKEN_TTL_SECONDS");
    const secure = this.configService.get<boolean>("COOKIE_SECURE") ?? false;

    setSessionCookies(res, session.accessToken, session.refreshToken, {
      accessTtlSeconds: accessTtl,
      refreshTtlSeconds: refreshTtl,
      secure,
    });

    return { status: "success", data: session.user };
  }
}
