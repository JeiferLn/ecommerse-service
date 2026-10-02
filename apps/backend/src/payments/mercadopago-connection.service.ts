import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CompanyPaymentsSettings, MercadoPagoConnectionView } from "@commerce-ai/types";
import { isCompanyPaymentsConfigured } from "@commerce-ai/types";
import type { MercadoPagoConnection, MercadoPagoConnectionSource } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";

import type { Env } from "../config/env.validation";
import { PrismaService } from "../prisma/prisma.service";

type OAuthTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: number | string;
  public_key?: string;
  live_mode?: boolean;
  scope?: string;
};

type OAuthStatePayload = {
  companyId: string;
  userId: string;
  exp: number;
};

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;
/** Renovar si quedan menos de 7 días (token OAuth dura ~180 días). */
const REFRESH_IF_WITHIN_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class MercadoPagoConnectionService {
  private readonly logger = new Logger(MercadoPagoConnectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  isOAuthConfigured(): boolean {
    return Boolean(
      this.config.get("MP_CLIENT_ID", { infer: true })?.trim() &&
      this.config.get("MP_CLIENT_SECRET", { infer: true })?.trim() &&
      this.getRedirectUri(),
    );
  }

  toPaymentsSettings(connection: MercadoPagoConnection | null): CompanyPaymentsSettings {
    const oauthAvailable = this.isOAuthConfigured();
    if (!connection || !isCompanyPaymentsConfigured(connection)) {
      return { isConfigured: false, connection: null, oauthAvailable };
    }
    return {
      isConfigured: true,
      connection: this.toView(connection, oauthAvailable),
      oauthAvailable,
    };
  }

  toView(
    connection: MercadoPagoConnection,
    oauthAvailable = this.isOAuthConfigured(),
  ): MercadoPagoConnectionView {
    return {
      isConnected: true,
      mpUserId: connection.mpUserId,
      mpNickname: connection.mpNickname,
      mpEmail: connection.mpEmail,
      mpFirstName: connection.mpFirstName,
      mpLastName: connection.mpLastName,
      mpSiteId: connection.mpSiteId,
      publicKey: connection.publicKey,
      source: connection.source,
      liveMode: connection.liveMode,
      connectedAt: connection.connectedAt.toISOString(),
      tokenExpiresAt: connection.tokenExpiresAt?.toISOString() ?? null,
      oauthAvailable,
    };
  }

  async getConnection(companyId: string | null): Promise<CompanyPaymentsSettings> {
    const scoped = this.requireCompany(companyId);
    let connection = await this.prisma.mercadoPagoConnection.findUnique({
      where: { companyId: scoped },
    });
    if (connection?.accessToken && !connection.mpNickname && !connection.mpEmail) {
      connection = await this.refreshSellerProfile(connection);
    }
    return this.toPaymentsSettings(connection);
  }

  async getRawConnection(companyId: string): Promise<MercadoPagoConnection | null> {
    return this.prisma.mercadoPagoConnection.findUnique({
      where: { companyId },
    });
  }

  /**
   * Devuelve un access token usable (refrescado si hace falta).
   * Lanza si la empresa no tiene MP conectado.
   */
  async getValidAccessToken(companyId: string): Promise<string> {
    const connection = await this.getRawConnection(companyId);
    if (!connection?.accessToken?.trim()) {
      throw new BadRequestException(
        "La tienda aún no conectó Mercado Pago. El dueño debe hacerlo en Configuración → Pagos.",
      );
    }

    if (
      connection.refreshToken &&
      connection.tokenExpiresAt &&
      connection.tokenExpiresAt.getTime() - Date.now() < REFRESH_IF_WITHIN_MS
    ) {
      try {
        return await this.refreshAccessToken(connection);
      } catch (error) {
        this.logger.warn(
          `No se pudo refrescar token MP de empresa ${companyId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        // Intentar con el token actual; puede seguir válido.
      }
    }

    return connection.accessToken;
  }

  async upsertManual(
    companyId: string | null,
    params: { accessToken: string; publicKey?: string | null },
  ): Promise<CompanyPaymentsSettings> {
    const scoped = this.requireCompany(companyId);
    const accessToken = params.accessToken.trim();
    if (!accessToken) {
      throw new BadRequestException("El Access Token es obligatorio");
    }
    const publicKey = params.publicKey?.trim() || null;
    const profile = await this.fetchSellerProfile(accessToken);

    await this.prisma.mercadoPagoConnection.upsert({
      where: { companyId: scoped },
      create: {
        companyId: scoped,
        accessToken,
        publicKey,
        refreshToken: null,
        mpUserId: profile.mpUserId,
        mpNickname: profile.mpNickname,
        mpEmail: profile.mpEmail,
        mpFirstName: profile.mpFirstName,
        mpLastName: profile.mpLastName,
        mpSiteId: profile.mpSiteId,
        tokenExpiresAt: null,
        source: "manual",
        liveMode: profile.liveModeHint ?? !accessToken.includes("TEST"),
        connectedAt: new Date(),
      },
      update: {
        accessToken,
        publicKey,
        refreshToken: null,
        mpUserId: profile.mpUserId,
        mpNickname: profile.mpNickname,
        mpEmail: profile.mpEmail,
        mpFirstName: profile.mpFirstName,
        mpLastName: profile.mpLastName,
        mpSiteId: profile.mpSiteId,
        tokenExpiresAt: null,
        source: "manual",
        liveMode: profile.liveModeHint ?? !accessToken.includes("TEST"),
        connectedAt: new Date(),
      },
    });

    return this.getConnection(scoped);
  }

  async disconnect(companyId: string | null): Promise<void> {
    const scoped = this.requireCompany(companyId);
    const existing = await this.prisma.mercadoPagoConnection.findUnique({
      where: { companyId: scoped },
    });
    if (!existing) {
      throw new NotFoundException("Mercado Pago no está conectado");
    }

    await this.prisma.$transaction([
      this.prisma.mercadoPagoConnection.delete({ where: { companyId: scoped } }),
      this.prisma.whatsAppConnection.updateMany({
        where: { companyId: scoped },
        data: { isActive: false },
      }),
    ]);
  }

  buildOAuthStartUrl(companyId: string | null, userId: string): { authorizationUrl: string } {
    const scoped = this.requireCompany(companyId);
    if (!this.isOAuthConfigured()) {
      throw new ServiceUnavailableException(
        "OAuth de Mercado Pago no está configurado en la plataforma (MP_CLIENT_ID / MP_CLIENT_SECRET / MP_REDIRECT_URI).",
      );
    }

    const clientId = this.config.get("MP_CLIENT_ID", { infer: true })!.trim();
    const redirectUri = this.getRedirectUri()!;
    const state = this.signState({
      companyId: scoped,
      userId,
      exp: Date.now() + OAUTH_STATE_TTL_MS,
    });

    const url = new URL("https://auth.mercadopago.com/authorization");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("platform_id", "mp");
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", redirectUri);

    return { authorizationUrl: url.toString() };
  }

  async handleOAuthCallback(params: {
    code?: string;
    state?: string;
    error?: string;
  }): Promise<{ redirectUrl: string }> {
    const frontend = (
      this.config.get("FRONTEND_URL", { infer: true }) || "http://localhost:3000"
    ).replace(/\/$/, "");
    const settingsBase = `${frontend}/settings/payments`;

    if (params.error) {
      this.logger.warn(`OAuth MP denegado: ${params.error}`);
      return { redirectUrl: `${settingsBase}?mp=error` };
    }
    if (!params.code?.trim() || !params.state?.trim()) {
      return { redirectUrl: `${settingsBase}?mp=error` };
    }

    let payload: OAuthStatePayload;
    try {
      payload = this.verifyState(params.state);
    } catch {
      return { redirectUrl: `${settingsBase}?mp=error` };
    }

    try {
      const token = await this.exchangeAuthorizationCode(params.code.trim());
      if (!token.access_token) {
        throw new Error("Respuesta OAuth sin access_token");
      }

      const expiresAt =
        typeof token.expires_in === "number"
          ? new Date(Date.now() + token.expires_in * 1000)
          : null;

      const profile = await this.fetchSellerProfile(token.access_token);

      await this.prisma.mercadoPagoConnection.upsert({
        where: { companyId: payload.companyId },
        create: {
          companyId: payload.companyId,
          accessToken: token.access_token,
          refreshToken: token.refresh_token ?? null,
          publicKey: token.public_key ?? null,
          mpUserId: profile.mpUserId ?? (token.user_id != null ? String(token.user_id) : null),
          mpNickname: profile.mpNickname,
          mpEmail: profile.mpEmail,
          mpFirstName: profile.mpFirstName,
          mpLastName: profile.mpLastName,
          mpSiteId: profile.mpSiteId,
          tokenExpiresAt: expiresAt,
          source: "oauth" satisfies MercadoPagoConnectionSource,
          liveMode: Boolean(token.live_mode),
          connectedAt: new Date(),
        },
        update: {
          accessToken: token.access_token,
          refreshToken: token.refresh_token ?? null,
          publicKey: token.public_key ?? null,
          mpUserId: profile.mpUserId ?? (token.user_id != null ? String(token.user_id) : null),
          mpNickname: profile.mpNickname,
          mpEmail: profile.mpEmail,
          mpFirstName: profile.mpFirstName,
          mpLastName: profile.mpLastName,
          mpSiteId: profile.mpSiteId,
          tokenExpiresAt: expiresAt,
          source: "oauth",
          liveMode: Boolean(token.live_mode),
          connectedAt: new Date(),
        },
      });

      return { redirectUrl: `${settingsBase}?mp=connected` };
    } catch (error) {
      this.logger.error(
        `Error canjeando code OAuth MP`,
        error instanceof Error ? error.stack : undefined,
      );
      return { redirectUrl: `${settingsBase}?mp=error` };
    }
  }

  private async refreshAccessToken(connection: MercadoPagoConnection): Promise<string> {
    if (!connection.refreshToken) {
      return connection.accessToken;
    }
    const clientId = this.config.get("MP_CLIENT_ID", { infer: true })?.trim();
    const clientSecret = this.config.get("MP_CLIENT_SECRET", { infer: true })?.trim();
    if (!clientId || !clientSecret) {
      return connection.accessToken;
    }

    const token = await this.postOAuthToken({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken,
    });

    if (!token.access_token) {
      throw new Error("Refresh sin access_token");
    }

    const expiresAt =
      typeof token.expires_in === "number" ? new Date(Date.now() + token.expires_in * 1000) : null;

    await this.prisma.mercadoPagoConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? connection.refreshToken,
        tokenExpiresAt: expiresAt,
        publicKey: token.public_key ?? connection.publicKey,
        mpUserId: token.user_id != null ? String(token.user_id) : connection.mpUserId,
      },
    });

    return token.access_token;
  }

  private async exchangeAuthorizationCode(code: string): Promise<OAuthTokenResponse> {
    const clientId = this.config.get("MP_CLIENT_ID", { infer: true })!.trim();
    const clientSecret = this.config.get("MP_CLIENT_SECRET", { infer: true })!.trim();
    const redirectUri = this.getRedirectUri()!;

    return this.postOAuthToken({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
  }

  private async postOAuthToken(body: Record<string, string>): Promise<OAuthTokenResponse> {
    const response = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as OAuthTokenResponse & {
      message?: string;
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.message || data.error || `OAuth HTTP ${response.status}`);
    }
    return data;
  }

  getRedirectUri(): string | null {
    const explicit = this.config.get("MP_REDIRECT_URI", { infer: true })?.trim();
    if (explicit) {
      return explicit.replace(/\/$/, "");
    }
    const apiPublic = this.config.get("API_PUBLIC_URL", { infer: true })?.trim();
    if (!apiPublic) {
      return null;
    }
    return `${apiPublic.replace(/\/$/, "")}/api/v1/payments/mercadopago/oauth/callback`;
  }

  /** Perfil público del vendedor vía GET /users/me (Mercado Libre/Pago). */
  private async fetchSellerProfile(accessToken: string): Promise<{
    mpUserId: string | null;
    mpNickname: string | null;
    mpEmail: string | null;
    mpFirstName: string | null;
    mpLastName: string | null;
    mpSiteId: string | null;
    liveModeHint?: boolean;
  }> {
    const empty = {
      mpUserId: null,
      mpNickname: null,
      mpEmail: null,
      mpFirstName: null,
      mpLastName: null,
      mpSiteId: null,
    };
    try {
      const response = await fetch("https://api.mercadolibre.com/users/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        this.logger.warn(`users/me respondió ${response.status}`);
        return empty;
      }
      const data = (await response.json()) as {
        id?: number | string;
        nickname?: string;
        email?: string;
        first_name?: string;
        last_name?: string;
        site_id?: string;
        tags?: string[];
      };
      const tags = data.tags ?? [];
      return {
        mpUserId: data.id != null ? String(data.id) : null,
        mpNickname: data.nickname?.trim() || null,
        mpEmail: data.email?.trim() || null,
        mpFirstName: data.first_name?.trim() || null,
        mpLastName: data.last_name?.trim() || null,
        mpSiteId: data.site_id?.trim() || null,
        liveModeHint: !tags.includes("test_user"),
      };
    } catch (error) {
      this.logger.warn(
        `No se pudo obtener perfil MP: ${error instanceof Error ? error.message : String(error)}`,
      );
      return empty;
    }
  }

  private async refreshSellerProfile(
    connection: MercadoPagoConnection,
  ): Promise<MercadoPagoConnection> {
    const profile = await this.fetchSellerProfile(connection.accessToken);
    if (!profile.mpUserId && !profile.mpNickname && !profile.mpEmail) {
      return connection;
    }
    return this.prisma.mercadoPagoConnection.update({
      where: { id: connection.id },
      data: {
        mpUserId: profile.mpUserId ?? connection.mpUserId,
        mpNickname: profile.mpNickname,
        mpEmail: profile.mpEmail,
        mpFirstName: profile.mpFirstName,
        mpLastName: profile.mpLastName,
        mpSiteId: profile.mpSiteId,
      },
    });
  }

  private signState(payload: OAuthStatePayload): string {
    const secret = this.config.getOrThrow("JWT_SECRET", { infer: true });
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", secret).update(body).digest("base64url");
    return `${body}.${sig}`;
  }

  private verifyState(state: string): OAuthStatePayload {
    const [body, sig] = state.split(".");
    if (!body || !sig) {
      throw new Error("state inválido");
    }
    const secret = this.config.getOrThrow("JWT_SECRET", { infer: true });
    const expected = createHmac("sha256", secret).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error("state firmado inválido");
    }
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as OAuthStatePayload;
    if (!payload.companyId || !payload.userId || !payload.exp) {
      throw new Error("state incompleto");
    }
    if (payload.exp < Date.now()) {
      throw new Error("state expirado");
    }
    return payload;
  }

  private requireCompany(companyId: string | null): string {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }
    return companyId;
  }
}
