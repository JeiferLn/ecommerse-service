import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { AuthUser, InvitationInfo, UserRole } from "@commerce-ai/types";
import { Prisma, type Invitation, type User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";

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
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
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

  async register(dto: RegisterDto): Promise<AuthSession> {
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const invitation = await this.prisma.invitation.findFirst({
      where: { email: dto.email.toLowerCase() },
    });

    if (invitation) {
      if (invitation.expiresAt <= new Date()) {
        await this.prisma.invitation.delete({ where: { id: invitation.id } });
      } else {
        return this.registerInvitedMember(dto, passwordHash, invitation);
      }
    }

    try {
      const { user, companyId } = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name: dto.name,
            email: dto.email,
            passwordHash,
            role: "owner",
          },
        });

        const company = await tx.company.create({
          data: { name: dto.companyName, type: dto.companyType, ownerId: created.id },
        });

        await tx.companyMembership.create({
          data: { userId: created.id, companyId: company.id, role: "owner" },
        });

        return { user: created, companyId: company.id };
      });

      return this.createSession(user, companyId, "owner");
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Ya existe una cuenta con ese email");
      }
      throw error;
    }
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

    return { email: invitation.email, companyName: invitation.company.name };
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

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.registerInvitedMember(dto, passwordHash, invitation);
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
