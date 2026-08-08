import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
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
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockAuthUser: AuthUser = {
  id: "user-1",
  name: "Test User",
  email: "test@test.com",
  role: "owner",
  companyId: "company-1",
  companies: [{ id: "company-1", name: "Mi Tienda", type: "retail", role: "owner" }],
};

describe("AuthService", () => {
  let service: AuthService;
  let usersService: {
    findByEmail: jest.Mock<Promise<User | null>, [email: string]>;
    findById: jest.Mock<Promise<User | null>, [id: string]>;
    toAuthUser: jest.Mock<Promise<AuthUser | null>, [userId: string, companyId: string | null]>;
  };
  let prisma: {
    $transaction: jest.Mock<
      Promise<unknown>,
      [callback: (tx: Prisma.TransactionClient) => Promise<unknown>]
    >;
    invitation: {
      findFirst: jest.Mock<Promise<unknown>, [args: Prisma.InvitationFindFirstArgs]>;
      findUnique: jest.Mock<Promise<unknown>, [args: Prisma.InvitationFindUniqueArgs]>;
      create: jest.Mock<Promise<unknown>, [args: Prisma.InvitationCreateArgs]>;
      delete: jest.Mock<Promise<unknown>, [args: Prisma.InvitationDeleteArgs]>;
      deleteMany: jest.Mock<Promise<unknown>, [args: Prisma.InvitationDeleteManyArgs]>;
    };
    companyMembership: {
      findMany: jest.Mock<Promise<unknown>, [args: Prisma.CompanyMembershipFindManyArgs]>;
      findUnique: jest.Mock<Promise<unknown>, [args: Prisma.CompanyMembershipFindUniqueArgs]>;
      create: jest.Mock<Promise<unknown>, [args: Prisma.CompanyMembershipCreateArgs]>;
      upsert: jest.Mock<Promise<unknown>, [args: Prisma.CompanyMembershipUpsertArgs]>;
    };
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
      toAuthUser: jest.fn<Promise<AuthUser | null>, [userId: string, companyId: string | null]>(
        () => Promise.resolve(mockAuthUser),
      ),
    };

    prisma = {
      $transaction: jest.fn((callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        callback(prisma as unknown as Prisma.TransactionClient),
      ),
      invitation: {
        findFirst: jest
          .fn<Promise<unknown>, [Prisma.InvitationFindFirstArgs]>()
          .mockResolvedValue(null),
        findUnique: jest.fn<Promise<unknown>, [Prisma.InvitationFindUniqueArgs]>(),
        create: jest.fn<Promise<unknown>, [Prisma.InvitationCreateArgs]>().mockResolvedValue({}),
        delete: jest.fn<Promise<unknown>, [Prisma.InvitationDeleteArgs]>().mockResolvedValue({}),
        deleteMany: jest
          .fn<Promise<unknown>, [Prisma.InvitationDeleteManyArgs]>()
          .mockResolvedValue({ count: 1 }),
      },
      companyMembership: {
        findMany: jest
          .fn<Promise<unknown>, [Prisma.CompanyMembershipFindManyArgs]>()
          .mockResolvedValue([]),
        findUnique: jest.fn<Promise<unknown>, [Prisma.CompanyMembershipFindUniqueArgs]>(),
        create: jest
          .fn<Promise<unknown>, [Prisma.CompanyMembershipCreateArgs]>()
          .mockResolvedValue({}),
        upsert: jest
          .fn<Promise<unknown>, [Prisma.CompanyMembershipUpsertArgs]>()
          .mockResolvedValue({ role: "user", companyId: "company-1" }),
      },
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
    it("crea un usuario owner con su empresa y abre sesión", async () => {
      const txUserCreate = jest.fn<Promise<User>, [args: Prisma.UserCreateArgs]>(() =>
        Promise.resolve(mockUser),
      );
      const txCompanyCreate = jest.fn<Promise<unknown>, [args: Prisma.CompanyCreateArgs]>(() =>
        Promise.resolve({ id: "company-1" }),
      );
      const txMembershipCreate = jest.fn<
        Promise<unknown>,
        [args: Prisma.CompanyMembershipCreateArgs]
      >(() => Promise.resolve({}));

      prisma.$transaction.mockImplementation((callback) =>
        callback({
          user: { create: txUserCreate },
          company: { create: txCompanyCreate },
          companyMembership: { create: txMembershipCreate },
        } as unknown as Prisma.TransactionClient),
      );

      const session = await service.register({
        name: "Test User",
        email: "test@test.com",
        password: "password123",
        companyName: "Mi Tienda",
        companyType: "retail",
        countryCode: "CO",
      });

      const userData = txUserCreate.mock.calls[0]?.[0].data as {
        role: string;
        passwordHash: string;
      };
      expect(userData.role).toBe("owner");
      expect(userData.passwordHash).not.toBe("password123");

      const companyData = txCompanyCreate.mock.calls[0]?.[0].data as {
        name: string;
        type: string;
        countryCode: string;
        ownerId: string;
      };
      expect(companyData).toEqual({
        name: "Mi Tienda",
        type: "retail",
        countryCode: "CO",
        ownerId: "user-1",
      });

      const membershipData = txMembershipCreate.mock.calls[0]?.[0].data as {
        userId: string;
        companyId: string;
        role: string;
      };
      expect(membershipData).toEqual({ userId: "user-1", companyId: "company-1", role: "owner" });

      expect(session.accessToken).toBe("access-token");
      expect(session.refreshToken).toHaveLength(64);
      expect(usersService.toAuthUser).toHaveBeenCalledWith("user-1", "company-1");
      expect(session.user.companyId).toBe("company-1");
    });

    it("vincula a un invitado pendiente como usuario de la empresa", async () => {
      prisma.invitation.findFirst.mockResolvedValue({
        id: "inv-1",
        email: "invited@test.com",
        companyId: "company-1",
        expiresAt: new Date(Date.now() + 3600_000),
        createdAt: new Date(),
      });

      const txUserCreate = jest.fn<Promise<User>, [args: Prisma.UserCreateArgs]>(() =>
        Promise.resolve({ ...mockUser, email: "invited@test.com", role: "user" }),
      );
      const txMembershipCreate = jest.fn<
        Promise<unknown>,
        [args: Prisma.CompanyMembershipCreateArgs]
      >(() => Promise.resolve({}));
      const txInvitationDelete = jest.fn<Promise<unknown>, [args: Prisma.InvitationDeleteManyArgs]>(
        () => Promise.resolve({ count: 1 }),
      );

      prisma.$transaction.mockImplementation((callback) =>
        callback({
          user: { create: txUserCreate },
          companyMembership: { create: txMembershipCreate },
          invitation: { deleteMany: txInvitationDelete },
        } as unknown as Prisma.TransactionClient),
      );
      usersService.toAuthUser.mockResolvedValue({
        ...mockAuthUser,
        email: "invited@test.com",
        role: "user",
      });

      const session = await service.register({
        name: "Invitado",
        email: "INVITED@test.com",
        password: "password123",
        companyName: "Cualquiera",
        companyType: "retail",
        countryCode: "MX",
      });

      const userData = txUserCreate.mock.calls[0]?.[0].data as { role: string };
      expect(userData.role).toBe("user");

      const membershipData = txMembershipCreate.mock.calls[0]?.[0].data as {
        userId: string;
        companyId: string;
        role: string;
      };
      expect(membershipData).toEqual({ userId: "user-1", companyId: "company-1", role: "user" });

      expect(txInvitationDelete).toHaveBeenCalled();
      expect(usersService.toAuthUser).toHaveBeenCalledWith("user-1", "company-1");
      expect(session.user.role).toBe("user");
    });

    it("ignora una invitación expirada y crea su propia empresa", async () => {
      prisma.invitation.findFirst.mockResolvedValue({
        id: "inv-1",
        email: "expirado@test.com",
        companyId: "company-1",
        expiresAt: new Date(Date.now() - 60_000),
        createdAt: new Date(),
      });
      prisma.invitation.delete.mockResolvedValue({});

      const txUserCreate = jest.fn<Promise<User>, [args: Prisma.UserCreateArgs]>(() =>
        Promise.resolve(mockUser),
      );
      const txCompanyCreate = jest.fn<Promise<unknown>, [args: Prisma.CompanyCreateArgs]>(() =>
        Promise.resolve({ id: "company-1" }),
      );
      const txMembershipCreate = jest.fn<
        Promise<unknown>,
        [args: Prisma.CompanyMembershipCreateArgs]
      >(() => Promise.resolve({}));

      prisma.$transaction.mockImplementation((callback) =>
        callback({
          user: { create: txUserCreate },
          company: { create: txCompanyCreate },
          companyMembership: { create: txMembershipCreate },
        } as unknown as Prisma.TransactionClient),
      );

      const session = await service.register({
        name: "Expirado",
        email: "expirado@test.com",
        password: "password123",
        companyName: "Mi Propia Tienda",
        companyType: "retail",
        countryCode: "AR",
      });

      expect(prisma.invitation.delete).toHaveBeenCalledWith({ where: { id: "inv-1" } });
      const userData = txUserCreate.mock.calls[0]?.[0].data as { role: string };
      expect(userData.role).toBe("owner");
      expect(session.user.role).toBe("owner");
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
          countryCode: "CO",
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("getInvitation", () => {
    it("devuelve el email y la empresa de una invitación vigente sin cuenta", async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: "inv-1",
        token: "token-1",
        email: "invited@test.com",
        companyId: "company-1",
        expiresAt: new Date(Date.now() + 3600_000),
        createdAt: new Date(),
        company: { name: "Mi Tienda" },
      });
      usersService.findByEmail.mockResolvedValue(null);

      const info = await service.getInvitation("token-1");

      expect(info).toEqual({
        email: "invited@test.com",
        companyName: "Mi Tienda",
        hasAccount: false,
      });
    });

    it("marca hasAccount si el email ya tiene cuenta", async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: "inv-1",
        token: "token-1",
        email: "test@test.com",
        companyId: "company-1",
        expiresAt: new Date(Date.now() + 3600_000),
        createdAt: new Date(),
        company: { name: "Mi Tienda" },
      });
      usersService.findByEmail.mockResolvedValue(mockUser);

      const info = await service.getInvitation("token-1");

      expect(info).toEqual({
        email: "test@test.com",
        companyName: "Mi Tienda",
        hasAccount: true,
      });
    });

    it("lanza NotFoundException si la invitación no existe", async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);

      await expect(service.getInvitation("token-inexistente")).rejects.toThrow(NotFoundException);
    });

    it("borra y rechaza una invitación expirada", async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: "inv-1",
        token: "token-1",
        email: "invited@test.com",
        companyId: "company-1",
        expiresAt: new Date(Date.now() - 60_000),
        createdAt: new Date(),
        company: { name: "Mi Tienda" },
      });

      await expect(service.getInvitation("token-1")).rejects.toThrow(GoneException);
      expect(prisma.invitation.delete).toHaveBeenCalledWith({ where: { id: "inv-1" } });
    });
  });

  describe("registerInvited", () => {
    it("crea la cuenta del invitado por token y abre sesión en su empresa", async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: "inv-1",
        token: "token-1",
        email: "invited@test.com",
        companyId: "company-1",
        expiresAt: new Date(Date.now() + 3600_000),
        createdAt: new Date(),
      });

      const txUserCreate = jest.fn<Promise<User>, [args: Prisma.UserCreateArgs]>(() =>
        Promise.resolve({ ...mockUser, email: "invited@test.com", role: "user" }),
      );
      const txMembershipCreate = jest.fn<
        Promise<unknown>,
        [args: Prisma.CompanyMembershipCreateArgs]
      >(() => Promise.resolve({}));
      const txInvitationDelete = jest.fn<Promise<unknown>, [args: Prisma.InvitationDeleteManyArgs]>(
        () => Promise.resolve({ count: 1 }),
      );

      prisma.$transaction.mockImplementation((callback) =>
        callback({
          user: { create: txUserCreate },
          companyMembership: { create: txMembershipCreate },
          invitation: { deleteMany: txInvitationDelete },
        } as unknown as Prisma.TransactionClient),
      );
      usersService.toAuthUser.mockResolvedValue({
        ...mockAuthUser,
        email: "invited@test.com",
        role: "user",
      });

      const session = await service.registerInvited({
        name: "Invitado",
        password: "password123",
        token: "token-1",
      });

      const userData = txUserCreate.mock.calls[0]?.[0].data as { role: string };
      expect(userData.role).toBe("user");
      expect(txMembershipCreate).toHaveBeenCalled();
      expect(txInvitationDelete).toHaveBeenCalled();
      expect(session.user.role).toBe("user");
      expect(session.user.companyId).toBe("company-1");
    });

    it("lanza NotFoundException con un token inválido", async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);

      await expect(
        service.registerInvited({ name: "Invitado", password: "password123", token: "no" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("borra y rechaza una invitación expirada", async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: "inv-1",
        token: "token-1",
        email: "invited@test.com",
        companyId: "company-1",
        expiresAt: new Date(Date.now() - 60_000),
        createdAt: new Date(),
      });

      await expect(
        service.registerInvited({ name: "Invitado", password: "password123", token: "token-1" }),
      ).rejects.toThrow(GoneException);
      expect(prisma.invitation.delete).toHaveBeenCalledWith({ where: { id: "inv-1" } });
    });

    it("lanza ConflictException si el email de la invitación ya tiene cuenta", async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: "inv-1",
        token: "token-1",
        email: "test@test.com",
        companyId: "company-1",
        expiresAt: new Date(Date.now() + 3600_000),
        createdAt: new Date(),
      });
      usersService.findByEmail.mockResolvedValue(mockUser);

      await expect(
        service.registerInvited({ name: "Invitado", password: "password123", token: "token-1" }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("acceptInvitation", () => {
    const invitation = {
      id: "inv-1",
      token: "token-1",
      email: "test@test.com",
      companyId: "company-1",
      expiresAt: new Date(Date.now() + 3600_000),
      createdAt: new Date(),
    };

    it("une al usuario con cuenta a la empresa y abre sesión en ella", async () => {
      prisma.invitation.findUnique.mockResolvedValue(invitation);
      usersService.findById.mockResolvedValue(mockUser);

      const session = await service.acceptInvitation("user-1", "token-1");

      expect(prisma.companyMembership.upsert).toHaveBeenCalledWith({
        where: { userId_companyId: { userId: "user-1", companyId: "company-1" } },
        update: {},
        create: { userId: "user-1", companyId: "company-1", role: "user" },
      });
      expect(prisma.invitation.delete).toHaveBeenCalledWith({ where: { id: "inv-1" } });
      expect(session.user.companyId).toBe("company-1");
      expect(session.user.role).toBe("owner");
    });

    it("lanza ForbiddenException si el token es de otro email", async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        ...invitation,
        email: "otro@test.com",
      });
      usersService.findById.mockResolvedValue(mockUser);

      await expect(service.acceptInvitation("user-1", "token-1")).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.companyMembership.upsert).not.toHaveBeenCalled();
    });

    it("lanza BadRequestException si el usuario es admin", async () => {
      prisma.invitation.findUnique.mockResolvedValue(invitation);
      usersService.findById.mockResolvedValue({ ...mockUser, role: "admin" });

      await expect(service.acceptInvitation("user-1", "token-1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("lanza NotFoundException si la invitación no existe", async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);

      await expect(service.acceptInvitation("user-1", "token-x")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("borra y rechaza una invitación expirada", async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        ...invitation,
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(service.acceptInvitation("user-1", "token-1")).rejects.toThrow(GoneException);
      expect(prisma.invitation.delete).toHaveBeenCalledWith({ where: { id: "inv-1" } });
    });
  });

  describe("login", () => {
    it("lanza UnauthorizedException con credenciales inválidas", async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: "test@test.com", password: "password123" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("abre sesión en la empresa owner del usuario", async () => {
      const hashed = await bcrypt.hash("password123", 10);
      usersService.findByEmail.mockResolvedValue({ ...mockUser, passwordHash: hashed });
      prisma.companyMembership.findMany.mockResolvedValue([
        {
          id: "m-1",
          userId: "user-1",
          companyId: "company-1",
          role: "owner",
          createdAt: new Date(),
        },
      ]);

      const session = await service.login({ email: "test@test.com", password: "password123" });

      expect(session.accessToken).toBe("access-token");
      expect(session.refreshToken).toHaveLength(64);
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: "user-1",
          role: "owner",
          companyId: "company-1",
          type: "access",
        }),
        expect.any(Object),
      );
      expect(usersService.toAuthUser).toHaveBeenCalledWith("user-1", "company-1");
      const expectedCreateData = expect.objectContaining({
        userId: "user-1",
        companyId: "company-1",
      }) as Prisma.RefreshTokenCreateInput;
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expectedCreateData }) as Prisma.RefreshTokenCreateArgs,
      );
    });

    it("abre sesión sin empresa si el usuario no tiene membresías", async () => {
      const hashed = await bcrypt.hash("password123", 10);
      usersService.findByEmail.mockResolvedValue({ ...mockUser, passwordHash: hashed });
      prisma.companyMembership.findMany.mockResolvedValue([]);

      await service.login({ email: "test@test.com", password: "password123" });

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: null, role: "owner" }),
        expect.any(Object),
      );
      expect(usersService.toAuthUser).toHaveBeenCalledWith("user-1", null);
    });
  });

  describe("refresh", () => {
    it("revoca el token anterior y crea uno nuevo manteniendo la empresa activa", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "token-1",
        tokenHash: "hash",
        userId: "user-1",
        companyId: "company-1",
        expiresAt: new Date(Date.now() + 100_000),
        revokedAt: null,
        user: mockUser,
      });
      prisma.companyMembership.findUnique.mockResolvedValue({
        id: "m-1",
        userId: "user-1",
        companyId: "company-1",
        role: "user",
        createdAt: new Date(),
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
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ role: "user", companyId: "company-1" }),
        expect.any(Object),
      );
      expect(session.user.id).toBe("user-1");
    });

    it("lanza UnauthorizedException si el token está revocado", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "token-1",
        tokenHash: "hash",
        userId: "user-1",
        companyId: null,
        expiresAt: new Date(Date.now() + 100_000),
        revokedAt: new Date(),
        user: mockUser,
      });

      await expect(service.refresh("revoked-token")).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("switchCompany", () => {
    it("cambia la empresa activa y rota la sesión", async () => {
      prisma.companyMembership.findUnique.mockResolvedValue({
        id: "m-2",
        userId: "user-1",
        companyId: "company-2",
        role: "user",
        createdAt: new Date(),
      });
      usersService.findById.mockResolvedValue(mockUser);
      usersService.toAuthUser.mockResolvedValue({
        ...mockAuthUser,
        companyId: "company-2",
        role: "user",
      });

      const session = await service.switchCompany("user-1", "company-2");

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: "company-2", role: "user" }),
        expect.any(Object),
      );
      expect(usersService.toAuthUser).toHaveBeenCalledWith("user-1", "company-2");
      expect(prisma.refreshToken.create).toHaveBeenCalled();
      expect(session.user.companyId).toBe("company-2");
    });

    it("lanza BadRequestException si no es miembro", async () => {
      prisma.companyMembership.findUnique.mockResolvedValue(null);

      await expect(service.switchCompany("user-1", "company-x")).rejects.toThrow(
        BadRequestException,
      );
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
    it("devuelve el usuario con su empresa activa", async () => {
      const result = await service.getMe("user-1", "company-1");

      expect(usersService.toAuthUser).toHaveBeenCalledWith("user-1", "company-1");
      expect(result.email).toBe("test@test.com");
      expect(result.companies).toHaveLength(1);
    });

    it("lanza UnauthorizedException si el usuario no existe", async () => {
      usersService.toAuthUser.mockResolvedValue(null);

      await expect(service.getMe("missing", null)).rejects.toThrow(UnauthorizedException);
    });
  });
});
