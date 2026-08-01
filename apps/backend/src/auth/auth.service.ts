import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { AuthUser } from "@commerce-ai/types";
import type { User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";

import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

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
  ) {}

  private get accessTokenTtlSeconds(): number {
    return this.configService.getOrThrow<number>("ACCESS_TOKEN_TTL_SECONDS");
  }

  private get refreshTokenTtlSeconds(): number {
    return this.configService.getOrThrow<number>("REFRESH_TOKEN_TTL_SECONDS");
  }

  async register(dto: RegisterDto): Promise<AuthUser> {
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.usersService.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: "owner",
    });

    return this.usersService.toPublicUser(user);
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
