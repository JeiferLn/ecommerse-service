import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { AuthUser, InvitationInfo, PlanCode, UserRole } from "@commerce-ai/types";
import { Prisma, type Invitation, type User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";

import { BillingService } from "../billing/billing.service";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { UsersService } from "../users/users.service";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { RegisterInvitedDto } from "./dto/register-invited.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  checkoutRequired?: boolean;
  desiredPlanCode?: PlanCode | null;
}

/** Resultado de registro: sesión (Free) o redirect a MP sin cuenta aún (pago). */
export interface RegisterOutcome {
  session: AuthSession | null;
  checkoutRequired: boolean;
  desiredPlanCode: PlanCode | null;
  initPoint: string | null;
}

const PENDING_REGISTRATION_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly billingService: BillingService,
  ) {}

  private get accessTokenTtlSeconds(): number {
    return this.configService.getOrThrow<number>("ACCESS_TOKEN_TTL_SECONDS");
  }

  private get refreshTokenTtlSeconds(): number {
    return this.configService.getOrThrow<number>("REFRESH_TOKEN_TTL_SECONDS");
  }

  private get resetTokenTtlSeconds(): number {
    return this.configService.getOrThrow<number>("RESET_TOKEN_TTL_SECONDS");
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      return;
    }

    const token = randomBytes(32).toString("hex");

    await this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash: this.hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + this.resetTokenTtlSeconds * 1000),
      },
    });

    const frontendUrl = this.configService.getOrThrow<string>("FRONTEND_URL");
    await this.mailService.sendPasswordReset({
      to: user.email,
      resetUrl: `${frontendUrl}/reset-password?token=${token}`,
    });
  }

  async register(dto: RegisterDto): Promise<RegisterOutcome> {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const email = dto.email.trim().toLowerCase();

    const invitation = await this.prisma.invitation.findFirst({
      where: { email },
    });

    if (invitation) {
      if (invitation.expiresAt <= new Date()) {
        await this.prisma.invitation.delete({ where: { id: invitation.id } });
      } else {
        const session = await this.registerInvitedMember(dto, passwordHash, invitation);
        return {
          session,
          checkoutRequired: false,
          desiredPlanCode: null,
          initPoint: null,
        };
      }
    }

    const desiredPlanCode = dto.planCode ?? "free";
    const paidPlan = desiredPlanCode === "pro" || desiredPlanCode === "business";

    if (paidPlan) {
      return this.registerPaidPending(dto, email, passwordHash, desiredPlanCode);
    }

    try {
      await this.billingService.ensurePlansSeeded();
      await this.prisma.pendingRegistration.deleteMany({ where: { email } });
      const { user, companyId } = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name: dto.name,
            email,
            passwordHash,
            role: "owner",
          },
        });

        const company = await tx.company.create({
          data: {
            name: dto.companyName,
            type: dto.companyType,
            countryCode: dto.countryCode.trim().toUpperCase(),
            ownerId: created.id,
          },
        });

        await tx.companyMembership.create({
          data: { userId: created.id, companyId: company.id, role: "owner" },
        });

        await this.billingService.startTrialForCompany(tx, company.id, null, null);

        return { user: created, companyId: company.id };
      });

      const session = await this.createSession(user, companyId, "owner");
      return {
        session,
        checkoutRequired: false,
        desiredPlanCode: null,
        initPoint: null,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Ya existe una cuenta con ese email");
      }
      throw error;
    }
  }

  /**
   * Plan de pago: no crea User/Company hasta que MP autorice el preapproval.
   * Guarda PendingRegistration y devuelve initPoint.
   */
  private async registerPaidPending(
    dto: RegisterDto,
    email: string,
    passwordHash: string,
    planCode: PlanCode,
  ): Promise<RegisterOutcome> {
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException("Ya existe una cuenta con ese email");
    }

    const interval = dto.billingInterval ?? "month";
    if (interval !== "month" && interval !== "year") {
      throw new BadRequestException("Intervalo de facturación inválido");
    }

    await this.billingService.ensurePlansSeeded();

    const expiresAt = new Date(Date.now() + PENDING_REGISTRATION_TTL_MS);
    let pending;
    try {
      pending = await this.prisma.pendingRegistration.upsert({
        where: { email },
        create: {
          email,
          name: dto.name,
          passwordHash,
          companyName: dto.companyName,
          companyType: dto.companyType,
          countryCode: dto.countryCode.trim().toUpperCase(),
          planCode,
          billingInterval: interval,
          expiresAt,
        },
        update: {
          name: dto.name,
          passwordHash,
          companyName: dto.companyName,
          companyType: dto.companyType,
          countryCode: dto.countryCode.trim().toUpperCase(),
          planCode,
          billingInterval: interval,
          expiresAt,
          completedAt: null,
          mpPreapprovalId: null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Ya existe una cuenta con ese email");
      }
      throw error;
    }

    try {
      const { initPoint, mpPreapprovalId } =
        await this.billingService.createPendingRegistrationCheckout({
          pendingId: pending.id,
          payerEmail: email,
          planCode: planCode as "pro" | "business",
          interval,
        });

      if (mpPreapprovalId) {
        await this.prisma.pendingRegistration.update({
          where: { id: pending.id },
          data: { mpPreapprovalId },
        });
      }

      return {
        session: null,
        checkoutRequired: true,
        desiredPlanCode: planCode,
        initPoint,
      };
    } catch (error) {
      await this.prisma.pendingRegistration
        .delete({ where: { id: pending.id } })
        .catch(() => undefined);
      throw error;
    }
  }

  /**
   * Completa un registro pendiente tras autorización/cobro de MP.
   * Idempotente si ya se creó la cuenta.
   */
  async completePendingRegistration(
    pendingId: string,
    opts?: { mpPreapprovalId?: string | null; mpPaymentId?: string | null },
  ): Promise<boolean> {
    const pending = await this.prisma.pendingRegistration.findUnique({
      where: { id: pendingId },
    });
    if (!pending) {
      return false;
    }
    if (pending.completedAt) {
      return true;
    }
    if (pending.expiresAt <= new Date()) {
      await this.prisma.pendingRegistration
        .delete({ where: { id: pending.id } })
        .catch(() => undefined);
      return false;
    }

    const existing = await this.usersService.findByEmail(pending.email);
    if (existing) {
      await this.prisma.pendingRegistration.update({
        where: { id: pending.id },
        data: {
          completedAt: new Date(),
          mpPreapprovalId: opts?.mpPreapprovalId ?? pending.mpPreapprovalId,
        },
      });
      return true;
    }

    await this.billingService.ensurePlansSeeded();

    try {
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name: pending.name,
            email: pending.email,
            passwordHash: pending.passwordHash,
            role: "owner",
          },
        });

        const company = await tx.company.create({
          data: {
            name: pending.companyName,
            type: pending.companyType,
            countryCode: pending.countryCode,
            ownerId: created.id,
          },
        });

        await tx.companyMembership.create({
          data: { userId: created.id, companyId: company.id, role: "owner" },
        });

        await this.billingService.createActivePaidSubscription(
          tx,
          company.id,
          pending.planCode,
          pending.billingInterval,
          opts?.mpPreapprovalId ?? pending.mpPreapprovalId,
          opts?.mpPaymentId ?? null,
        );

        await tx.pendingRegistration.update({
          where: { id: pending.id },
          data: {
            completedAt: new Date(),
            mpPreapprovalId: opts?.mpPreapprovalId ?? pending.mpPreapprovalId,
          },
        });
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        await this.prisma.pendingRegistration.update({
          where: { id: pending.id },
          data: { completedAt: new Date() },
        });
        return true;
      }
      throw error;
    }
  }

  /** Webhook/mp-return: intenta completar registro pendiente desde preapproval MP. */
  async tryCompletePendingFromPreapproval(preapprovalId: string): Promise<boolean> {
    const parsed = await this.billingService.resolvePendingFromPreapproval(preapprovalId);
    if (parsed) {
      return this.completePendingRegistration(parsed.pendingId, {
        mpPreapprovalId: preapprovalId,
      });
    }

    // Fallback: pending guardado por mpPreapprovalId aunque falle el parse del external_reference.
    const byMp = await this.prisma.pendingRegistration.findFirst({
      where: { mpPreapprovalId: preapprovalId, completedAt: null },
    });
    if (!byMp) {
      return false;
    }
    const authorized = await this.billingService.isPreapprovalAuthorized(preapprovalId);
    if (!authorized) {
      return false;
    }
    return this.completePendingRegistration(byMp.id, { mpPreapprovalId: preapprovalId });
  }

  /**
   * Retorno desde MP: completa por pendingId (en back_url) y/o preapproval_id.
   */
  async tryCompletePendingFromReturn(opts: {
    pendingId?: string | null;
    preapprovalId?: string | null;
  }): Promise<boolean> {
    const preapprovalId = opts.preapprovalId?.trim() || null;
    if (preapprovalId) {
      const ok = await this.tryCompletePendingFromPreapproval(preapprovalId);
      if (ok) {
        return true;
      }
    }

    const pendingId = opts.pendingId?.trim() || null;
    if (!pendingId) {
      return false;
    }

    const pending = await this.prisma.pendingRegistration.findUnique({
      where: { id: pendingId },
    });
    if (!pending) {
      return false;
    }
    if (pending.completedAt) {
      return true;
    }
    if (!pending.mpPreapprovalId) {
      return false;
    }

    const authorized = await this.billingService.isPreapprovalAuthorized(pending.mpPreapprovalId);
    if (!authorized) {
      return false;
    }
    return this.completePendingRegistration(pending.id, {
      mpPreapprovalId: pending.mpPreapprovalId,
    });
  }

  async tryCompletePendingFromExternalRef(
    external: string,
    paymentId?: string | null,
  ): Promise<boolean> {
    const parsed = this.billingService.parsePendingRegistrationExternalRef(external);
    if (!parsed) {
      return false;
    }
    return this.completePendingRegistration(parsed.pendingId, {
      mpPaymentId: paymentId ?? null,
    });
  }

  private async registerInvitedMember(
    dto: RegisterDto | RegisterInvitedDto,
    passwordHash: string,
    invitation: Invitation,
  ): Promise<AuthSession> {
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name: dto.name,
            email: invitation.email,
            passwordHash,
            role: "user",
          },
        });

        await tx.companyMembership.create({
          data: { userId: created.id, companyId: invitation.companyId, role: "user" },
        });

        await tx.invitation.deleteMany({ where: { email: invitation.email } });

        return created;
      });

      return this.createSession(user, invitation.companyId, "user");
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Ya existe una cuenta con ese email");
      }
      throw error;
    }
  }

  async getInvitation(token: string): Promise<InvitationInfo> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { company: { select: { name: true } } },
    });

    if (!invitation) {
      throw new NotFoundException("Invitación no encontrada");
    }

    if (invitation.expiresAt <= new Date()) {
      await this.prisma.invitation.delete({ where: { id: invitation.id } });
      throw new GoneException("La invitación expiró");
    }

    const account = await this.usersService.findByEmail(invitation.email);

    return {
      email: invitation.email,
      companyName: invitation.company.name,
      hasAccount: Boolean(account),
    };
  }

  async registerInvited(dto: RegisterInvitedDto): Promise<AuthSession> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token: dto.token },
    });

    if (!invitation) {
      throw new NotFoundException("Invitación no encontrada");
    }

    if (invitation.expiresAt <= new Date()) {
      await this.prisma.invitation.delete({ where: { id: invitation.id } });
      throw new GoneException("La invitación expiró");
    }

    const existing = await this.usersService.findByEmail(invitation.email);
    if (existing) {
      throw new ConflictException(
        "Ya existe una cuenta con ese email. Inicia sesión para aceptar la invitación",
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.registerInvitedMember(dto, passwordHash, invitation);
  }

  async acceptInvitation(userId: string, token: string): Promise<AuthSession> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
    });

    if (!invitation) {
      throw new NotFoundException("Invitación no encontrada");
    }

    if (invitation.expiresAt <= new Date()) {
      await this.prisma.invitation.delete({ where: { id: invitation.id } });
      throw new GoneException("La invitación expiró");
    }

    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException("Usuario no encontrado");
    }

    if (user.role === "admin") {
      throw new BadRequestException(
        "Un administrador de la plataforma no puede unirse a una empresa",
      );
    }

    if (user.email !== invitation.email) {
      throw new ForbiddenException("Esta invitación es para otro email");
    }

    const membership = await this.prisma.companyMembership.upsert({
      where: { userId_companyId: { userId, companyId: invitation.companyId } },
      update: {},
      create: { userId, companyId: invitation.companyId, role: "user" },
    });

    await this.prisma.invitation.delete({ where: { id: invitation.id } });

    return this.createSession(user, invitation.companyId, membership.role);
  }

  async login(dto: LoginDto): Promise<AuthSession> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Credenciales inválidas");
    }

    const memberships = await this.prisma.companyMembership.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });

    const activeMembership =
      memberships.find((membership) => membership.role === "owner") ?? memberships[0];

    return this.createSession(
      user,
      activeMembership?.companyId ?? null,
      activeMembership?.role ?? user.role,
    );
  }

  async refresh(refreshToken: string | undefined): Promise<AuthSession> {
    if (!refreshToken) {
      throw new UnauthorizedException("Sesión expirada, inicia sesión nuevamente");
    }

    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(refreshToken) },
      include: { user: true },
    });

    if (!record || record.revokedAt !== null || record.expiresAt < new Date()) {
      throw new UnauthorizedException("Sesión expirada, inicia sesión nuevamente");
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    const companyId = record.companyId;
    const role = await this.effectiveRole(record.user.id, companyId, record.user.role);

    return this.createSession(record.user, companyId, role);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getMe(userId: string, companyId: string | null): Promise<AuthUser> {
    const user = await this.usersService.toAuthUser(userId, companyId);

    if (!user) {
      throw new UnauthorizedException("Usuario no encontrado");
    }

    return user;
  }

  async switchCompany(userId: string, companyId: string): Promise<AuthSession> {
    const membership = await this.prisma.companyMembership.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });

    if (!membership) {
      throw new BadRequestException("No eres miembro de esa empresa");
    }

    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException("Usuario no encontrado");
    }

    return this.createSession(user, companyId, membership.role);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(dto.token) },
      include: { user: true },
    });

    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException("El enlace es inválido o ha expirado");
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    await this.prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });

    await this.prisma.passwordResetToken.deleteMany({ where: { userId: record.userId } });
    await this.prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async effectiveRole(
    userId: string,
    companyId: string | null,
    fallbackRole: UserRole,
  ): Promise<UserRole> {
    if (!companyId) {
      return fallbackRole;
    }

    const membership = await this.prisma.companyMembership.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });

    return membership?.role ?? fallbackRole;
  }

  private async createSession(
    user: User,
    companyId: string | null,
    role: UserRole,
  ): Promise<AuthSession> {
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, role, companyId, type: "access" },
      { expiresIn: this.accessTokenTtlSeconds },
    );

    const refreshToken = await this.createRefreshToken(user, companyId);
    const authUser = await this.usersService.toAuthUser(user.id, companyId);

    return {
      user: authUser ?? {
        id: user.id,
        name: user.name,
        email: user.email,
        role,
        companyId,
        companies: [],
      },
      accessToken,
      refreshToken,
    };
  }

  private async createRefreshToken(user: User, companyId: string | null): Promise<string> {
    const token = randomBytes(32).toString("hex");

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(token),
        userId: user.id,
        companyId,
        expiresAt: new Date(Date.now() + this.refreshTokenTtlSeconds * 1000),
      },
    });

    return token;
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
