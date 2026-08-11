import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Param, Post, Query, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import type { ApiResponse, AuthUser, InvitationInfo, RegisterResult } from "@commerce-ai/types";
import type { Request, Response } from "express";

import { BillingService } from "../billing/billing.service";
import { clearSessionCookies, setSessionCookies } from "../common/session-cookies";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { REFRESH_TOKEN_COOKIE } from "./auth.constants";
import type { AuthenticatedUser } from "./auth.types";
import { AuthService } from "./auth.service";
import { AcceptInvitationDto } from "./dto/accept-invitation.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { RegisterInvitedDto } from "./dto/register-invited.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

/** Límite estricto para endpoints públicos sensibles (por IP / minuto). */
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } } as const;

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly billingService: BillingService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post("register")
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<RegisterResult>> {
    const outcome = await this.authService.register(dto);

    if (outcome.session) {
      this.setSessionCookies(res, outcome.session.accessToken, outcome.session.refreshToken);
    }

    return {
      status: "success",
      data: {
        user: outcome.session?.user ?? null,
        checkoutRequired: outcome.checkoutRequired,
        desiredPlanCode: outcome.desiredPlanCode,
        initPoint: outcome.initPoint,
      },
    };
  }

  /**
   * Retorno HTTPS tras pago de registro (ngrok). Completa PendingRegistration y redirige a localhost.
   * MP a veces concatena `?preapproval_id=` con otro `?` y corrompe query params; por eso el
   * pendingId va en el path y sanitizamos valores.
   */
  @Public()
  @Get("mp-return/:pendingId")
  async mpReturnWithPending(
    @Param("pendingId") pendingIdParam: string,
    @Query("status") status: string | undefined,
    @Query("preapproval_id") preapprovalId: string | undefined,
    @Query("preapprovalId") preapprovalIdAlt: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    await this.handleMpRegisterReturn({
      pendingId: pendingIdParam,
      status,
      preapprovalId: preapprovalId ?? preapprovalIdAlt,
      res,
    });
  }

  @Public()
  @Get("mp-return")
  async mpReturn(
    @Query("status") status: string | undefined,
    @Query("pendingId") pendingId: string | undefined,
    @Query("preapproval_id") preapprovalId: string | undefined,
    @Query("preapprovalId") preapprovalIdAlt: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    await this.handleMpRegisterReturn({
      pendingId,
      status,
      preapprovalId: preapprovalId ?? preapprovalIdAlt,
      res,
    });
  }

  private async handleMpRegisterReturn(params: {
    pendingId?: string;
    status?: string;
    preapprovalId?: string;
    res: Response;
  }): Promise<void> {
    const pendingId = this.sanitizeMpReturnValue(params.pendingId);
    const preapprovalFromPending = this.extractEmbeddedQueryParam(
      params.pendingId,
      "preapproval_id",
    );
    const preapproval =
      this.sanitizeMpReturnValue(params.preapprovalId) || preapprovalFromPending || null;

    try {
      const ok = await this.authService.tryCompletePendingFromReturn({
        pendingId,
        preapprovalId: preapproval,
      });
      if (!ok) {
        this.logger.warn(
          `mp-return: registro no completado pendingId=${pendingId ?? "-"} preapproval=${preapproval ?? "-"}`,
        );
      } else {
        this.logger.log(`mp-return: cuenta creada pendingId=${pendingId ?? "-"}`);
      }
    } catch (error) {
      this.logger.error(
        `mp-return: error completando registro pendingId=${pendingId ?? "-"}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    const statusRaw = this.sanitizeMpReturnValue(params.status) ?? "success";
    params.res.redirect(
      302,
      this.billingService.getFrontendBillingReturnUrl(statusRaw, "register"),
    );
  }

  /** MP a veces deja `valor?otra=cosa` dentro de un query param. */
  private sanitizeMpReturnValue(value?: string | null): string | undefined {
    if (!value?.trim()) {
      return undefined;
    }
    return value.split("?")[0]?.trim() || undefined;
  }

  private extractEmbeddedQueryParam(
    raw: string | undefined,
    key: string,
  ): string | undefined {
    if (!raw) {
      return undefined;
    }
    const match = new RegExp(`[?&]${key}=([^&]+)`, "i").exec(raw);
    return match?.[1] ? decodeURIComponent(match[1]) : undefined;
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post("register-invited")
  async registerInvited(
    @Body() dto: RegisterInvitedDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<AuthUser>> {
    const session = await this.authService.registerInvited(dto);
    this.setSessionCookies(res, session.accessToken, session.refreshToken);
    return { status: "success", data: session.user };
  }

  @Public()
  @Get("invitation")
  async invitation(@Query("token") token: string): Promise<ApiResponse<InvitationInfo>> {
    return {
      status: "success",
      data: await this.authService.getInvitation(token),
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post("invitations/accept")
  async acceptInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AcceptInvitationDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<AuthUser>> {
    const session = await this.authService.acceptInvitation(user.id, dto.token);
    this.setSessionCookies(res, session.accessToken, session.refreshToken);
    return { status: "success", data: session.user };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
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
  @Throttle(AUTH_THROTTLE)
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
  @Throttle(AUTH_THROTTLE)
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
