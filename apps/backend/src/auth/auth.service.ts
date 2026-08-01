import {
  ConflictException,
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { AuthUser } from "@commerce-ai/types";
import { Prisma, type User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";

import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { UsersService } from "../users/users.service";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
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

    try {
      const user = await this.prisma.$transaction(async (tx) => {
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

        return tx.user.update({
          where: { id: created.id },
          data: { companyId: company.id },
        });
      });

      return this.createSession(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Ya existe una cuenta con ese email");
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthSession> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Credenciales inválidas");
    }

    return this.createSession(user);
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

    return this.createSession(record.user);
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

  async getMe(userId: string): Promise<AuthUser> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException("Usuario no encontrado");
    }

    return this.usersService.toPublicUser(user);
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

  private async createSession(user: User): Promise<AuthSession> {
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, role: user.role, type: "access" },
      { expiresIn: this.accessTokenTtlSeconds },
    );

    const refreshToken = await this.createRefreshToken(user);

    return {
      user: this.usersService.toPublicUser(user),
      accessToken,
      refreshToken,
    };
  }

  private async createRefreshToken(user: User): Promise<string> {
    const token = randomBytes(32).toString("hex");

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + this.refreshTokenTtlSeconds * 1000),
      },
    });

    return token;
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
