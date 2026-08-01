import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiResponse, AuthUser } from "@commerce-ai/types";
import type { Request, Response } from "express";

import { clearSessionCookies, setSessionCookies } from "../common/session-cookies";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { REFRESH_TOKEN_COOKIE } from "./auth.constants";
import { AuthService } from "./auth.service";
import type { AuthenticatedUser } from "./auth.types";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post("register")
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<AuthUser>> {
    const session = await this.authService.register(dto);
    this.setSessionCookies(res, session.accessToken, session.refreshToken);
    return { status: "success", data: session.user };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<AuthUser>> {
    const session = await this.authService.login(dto);
    this.setSessionCookies(res, session.accessToken, session.refreshToken);
    return { status: "success", data: session.user };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("refresh")
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<AuthUser>> {
    const session = await this.authService.refresh(this.getRefreshToken(req));
    this.setSessionCookies(res, session.accessToken, session.refreshToken);
    return { status: "success", data: session.user };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("forgot-password")
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<ApiResponse<null>> {
    await this.authService.forgotPassword(dto);
    return {
      status: "success",
      data: null,
      message:
        "Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña",
    };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("reset-password")
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<ApiResponse<null>> {
    await this.authService.resetPassword(dto);
    return {
      status: "success",
      data: null,
      message: "Contraseña actualizada, inicia sesión nuevamente",
    };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("logout")
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<null>> {
    await this.authService.logout(this.getRefreshToken(req));
    this.clearSessionCookies(res);
    return { status: "success", data: null };
  }

  @Get("me")
  async me(@CurrentUser() user: AuthenticatedUser): Promise<ApiResponse<AuthUser>> {
    return { status: "success", data: await this.authService.getMe(user.id, user.companyId) };
  }

  private getRefreshToken(req: Request): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[REFRESH_TOKEN_COOKIE];
  }

  private setSessionCookies(res: Response, accessToken: string, refreshToken: string): void {
    setSessionCookies(res, accessToken, refreshToken, this.cookieOptions());
  }

  private clearSessionCookies(res: Response): void {
    clearSessionCookies(res);
  }

  private cookieOptions() {
    return {
      accessTtlSeconds: this.configService.getOrThrow<number>("ACCESS_TOKEN_TTL_SECONDS"),
      refreshTtlSeconds: this.configService.getOrThrow<number>("REFRESH_TOKEN_TTL_SECONDS"),
      secure: this.configService.get<boolean>("COOKIE_SECURE") ?? false,
    };
  }
}
