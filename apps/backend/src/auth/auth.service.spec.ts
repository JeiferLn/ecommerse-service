import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ConflictException, UnauthorizedException } from "@nestjs/common";
import { Prisma, type User } from "@prisma/client";
import type { AuthUser } from "@commerce-ai/types";
import bcrypt from "bcryptjs";

import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { UsersService } from "../users/users.service";
import { AuthService } from "./auth.service";

const mockUser: User = {
  id: "user-1",
  name: "Test User",
  email: "test@test.com",
  passwordHash: "hash",
  role: "owner",
  companyId: "company-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("AuthService", () => {
  let service: AuthService;
  let usersService: {
    findByEmail: jest.Mock<Promise<User | null>, [email: string]>;
    findById: jest.Mock<Promise<User | null>, [id: string]>;
    toPublicUser: jest.Mock<AuthUser, [user: User]>;
  };
  let prisma: {
    $transaction: jest.Mock<
      Promise<unknown>,
      [callback: (tx: Prisma.TransactionClient) => Promise<unknown>]
    >;
    refreshToken: {
      create: jest.Mock<Promise<unknown>, [args: Prisma.RefreshTokenCreateArgs]>;
      findUnique: jest.Mock<Promise<unknown>, [args: Prisma.RefreshTokenFindUniqueArgs]>;
      update: jest.Mock<Promise<unknown>, [args: Prisma.RefreshTokenUpdateArgs]>;
      updateMany: jest.Mock<Promise<unknown>, [args: Prisma.RefreshTokenUpdateManyArgs]>;
    };
    passwordResetToken: {
      create: jest.Mock<Promise<unknown>, [args: Prisma.PasswordResetTokenCreateArgs]>;
      deleteMany: jest.Mock<Promise<unknown>, [args: Prisma.PasswordResetTokenDeleteManyArgs]>;
      findUnique: jest.Mock<Promise<unknown>, [args: Prisma.PasswordResetTokenFindUniqueArgs]>;
    };
    user: {
      update: jest.Mock<Promise<unknown>, [args: Prisma.UserUpdateArgs]>;
    };
  };
  let jwtService: { signAsync: jest.Mock<Promise<string>, [payload: object]> };
  let mailService: {
    sendPasswordReset: jest.Mock<Promise<void>, [params: { to: string; resetUrl: string }]>;
  };

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn<Promise<User | null>, [email: string]>(),
      findById: jest.fn<Promise<User | null>, [id: string]>(),
      toPublicUser: jest.fn((user: User) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
      })),
    };

    prisma = {
      $transaction: jest.fn((callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        callback(prisma as unknown as Prisma.TransactionClient),
      ),
      refreshToken: {
        create: jest.fn<Promise<unknown>, [Prisma.RefreshTokenCreateArgs]>().mockResolvedValue({}),
        findUnique: jest.fn<Promise<unknown>, [Prisma.RefreshTokenFindUniqueArgs]>(),
        update: jest.fn<Promise<unknown>, [Prisma.RefreshTokenUpdateArgs]>().mockResolvedValue({}),
        updateMany: jest
          .fn<Promise<unknown>, [Prisma.RefreshTokenUpdateManyArgs]>()
          .mockResolvedValue({ count: 1 }),
      },
      passwordResetToken: {
        create: jest
          .fn<Promise<unknown>, [Prisma.PasswordResetTokenCreateArgs]>()
          .mockResolvedValue({}),
        deleteMany: jest
          .fn<Promise<unknown>, [Prisma.PasswordResetTokenDeleteManyArgs]>()
          .mockResolvedValue({ count: 1 }),
        findUnique: jest.fn<Promise<unknown>, [Prisma.PasswordResetTokenFindUniqueArgs]>(),
      },
      user: {
        update: jest.fn<Promise<unknown>, [Prisma.UserUpdateArgs]>().mockResolvedValue(mockUser),
      },
    };

    jwtService = {
      signAsync: jest.fn<Promise<string>, [payload: object]>().mockResolvedValue("access-token"),
    };

    mailService = {
      sendPasswordReset: jest
        .fn<Promise<void>, [params: { to: string; resetUrl: string }]>()
        .mockResolvedValue(),
    };

    const configService = {
      getOrThrow: jest.fn((key: string) => {
        switch (key) {
          case "ACCESS_TOKEN_TTL_SECONDS":
            return 900;
          case "REFRESH_TOKEN_TTL_SECONDS":
            return 604800;
          case "RESET_TOKEN_TTL_SECONDS":
            return 3600;
          case "FRONTEND_URL":
            return "http://localhost:3000";
          default:
            return undefined;
        }
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe("register", () => {
    it("crea un usuario owner con su empresa en una transacción", async () => {
      prisma.$transaction.mockResolvedValue(mockUser);
      const txCreate = jest.fn<Promise<User>, [args: Prisma.UserCreateArgs]>(() =>
        Promise.resolve(mockUser),
      );
      const txCompanyCreate = jest.fn<Promise<unknown>, [args: Prisma.CompanyCreateArgs]>(() =>
        Promise.resolve({ id: "company-1" }),
      );
      const txUserUpdate = jest.fn<Promise<User>, [args: Prisma.UserUpdateArgs]>(() =>
        Promise.resolve(mockUser),
      );

      const result = await service.register({
        name: "Test User",
        email: "test@test.com",
        password: "password123",
        companyName: "Mi Tienda",
        companyType: "retail",
      });

      const tx = {
        user: { create: txCreate, update: txUserUpdate },
        company: { create: txCompanyCreate },
      } as unknown as Prisma.TransactionClient;
      await prisma.$transaction.mock.calls[0]?.[0](tx);
      expect(txCreate).toHaveBeenCalledTimes(1);
      expect(txCompanyCreate).toHaveBeenCalledTimes(1);
      expect(txUserUpdate).toHaveBeenCalledTimes(1);

      const createdData = txCreate.mock.calls[0]?.[0].data as {
        role: string;
        passwordHash: string;
      };
      expect(createdData.role).toBe("owner");
      expect(createdData.passwordHash).not.toBe("password123");

      const companyData = txCompanyCreate.mock.calls[0]?.[0].data as {
        name: string;
        type: string;
        ownerId: string;
      };
      expect(companyData).toEqual({
        name: "Mi Tienda",
        type: "retail",
        ownerId: "user-1",
      });

      expect(result.role).toBe("owner");
      expect(result.companyId).toBe("company-1");
    });

    it("lanza ConflictException si el email ya existe", async () => {
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: Prisma.prismaVersion.client,
        }),
      );

      await expect(
        service.register({
          name: "Test User",
          email: "test@test.com",
          password: "password123",
          companyName: "Mi Tienda",
          companyType: "retail",
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("login", () => {
    it("lanza UnauthorizedException con credenciales inválidas", async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: "test@test.com", password: "password123" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("devuelve sesión con tokens y usuario público", async () => {
      const hashed = await bcrypt.hash("password123", 10);
      usersService.findByEmail.mockResolvedValue({ ...mockUser, passwordHash: hashed });

      const session = await service.login({ email: "test@test.com", password: "password123" });

      expect(session.accessToken).toBe("access-token");
      expect(session.refreshToken).toHaveLength(64);
      expect(session.user).toEqual({
        id: "user-1",
        name: "Test User",
        email: "test@test.com",
        role: "owner",
        companyId: "company-1",
      });
      const expectedCreateData = expect.objectContaining({
        userId: "user-1",
        tokenHash: expect.any(String) as string,
        expiresAt: expect.any(Date) as Date,
      }) as Prisma.RefreshTokenCreateInput;
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expectedCreateData }) as Prisma.RefreshTokenCreateArgs,
      );
    });
  });

  describe("refresh", () => {
    it("revoca el token anterior y crea uno nuevo", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "token-1",
        tokenHash: "hash",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 100_000),
        revokedAt: null,
        user: mockUser,
      });

      const session = await service.refresh("valid-token");

      const expectedUpdateData = expect.objectContaining({
        revokedAt: expect.any(Date) as Date,
      }) as Prisma.RefreshTokenUpdateInput;
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "token-1" },
          data: expectedUpdateData,
        }) as Prisma.RefreshTokenUpdateArgs,
      );
      expect(prisma.refreshToken.create).toHaveBeenCalled();
      expect(session.user.id).toBe("user-1");
    });

    it("lanza UnauthorizedException si el token está revocado", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "token-1",
        tokenHash: "hash",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 100_000),
        revokedAt: new Date(),
        user: mockUser,
      });

      await expect(service.refresh("revoked-token")).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("forgotPassword", () => {
    it("crea un token de reset hasheado si el email existe", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);

      await service.forgotPassword({ email: "test@test.com" });

      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1" },
        }) as Prisma.PasswordResetTokenDeleteManyArgs,
      );
      const expectedCreateData = expect.objectContaining({
        userId: "user-1",
        tokenHash: expect.any(String) as string,
        expiresAt: expect.any(Date) as Date,
      }) as Prisma.PasswordResetTokenCreateInput;
      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expectedCreateData,
        }) as Prisma.PasswordResetTokenCreateArgs,
      );
      const createdData = prisma.passwordResetToken.create.mock.calls[0]?.[0].data;
      expect(createdData?.tokenHash).toHaveLength(64);
      expect(createdData?.tokenHash).not.toContain("reset");

      const emailParams = mailService.sendPasswordReset.mock.calls[0]?.[0];
      expect(emailParams?.to).toBe("test@test.com");
      expect(emailParams?.resetUrl).toMatch(/^http:\/\/localhost:3000\/reset-password\?token=/);
    });

    it("no crea tokens ni envía correo si el email no existe", async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await service.forgotPassword({ email: "missing@test.com" });

      expect(prisma.passwordResetToken.deleteMany).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mailService.sendPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe("resetPassword", () => {
    const validToken = "a".repeat(64);

    beforeEach(() => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "reset-1",
        tokenHash: validToken,
        userId: "user-1",
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        user: mockUser,
      });
    });

    it("actualiza la contraseña, borra los tokens y revoca las sesiones", async () => {
      await service.resetPassword({ token: validToken, password: "newpassword123" });

      const expectedUserData = expect.objectContaining({
        passwordHash: expect.any(String) as string,
      }) as Prisma.UserUpdateInput;
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "user-1" },
          data: expectedUserData,
        }) as Prisma.UserUpdateArgs,
      );

      const updatedHash = (prisma.user.update.mock.calls[0]?.[0].data as Prisma.UserUpdateInput)
        .passwordHash as string;
      expect(updatedHash).not.toBe("newpassword123");

      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1" },
        }) as Prisma.PasswordResetTokenDeleteManyArgs,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1", revokedAt: null },
        }) as Prisma.RefreshTokenUpdateManyArgs,
      );
    });

    it("lanza BadRequestException si el token no existe", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: "b".repeat(64), password: "newpassword123" }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("lanza BadRequestException si el token expiró", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "reset-1",
        tokenHash: validToken,
        userId: "user-1",
        expiresAt: new Date(Date.now() - 60_000),
        createdAt: new Date(),
        user: mockUser,
      });

      await expect(
        service.resetPassword({ token: validToken, password: "newpassword123" }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("revoca el refresh token", async () => {
      await service.logout("some-token");

      const expectedWhere = expect.objectContaining({
        tokenHash: expect.any(String) as string,
      }) as Prisma.RefreshTokenWhereInput;
      const expectedManyData = expect.objectContaining({
        revokedAt: expect.any(Date) as Date,
      }) as Prisma.RefreshTokenUpdateManyMutationInput;
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectedWhere,
          data: expectedManyData,
        }) as Prisma.RefreshTokenUpdateManyArgs,
      );
    });
  });

  describe("getMe", () => {
    it("devuelve el usuario público", async () => {
      usersService.findById.mockResolvedValue(mockUser);

      const result = await service.getMe("user-1");

      expect(result.email).toBe("test@test.com");
    });

    it("lanza UnauthorizedException si el usuario no existe", async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(service.getMe("missing")).rejects.toThrow(UnauthorizedException);
    });
  });
});
