import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, type User } from "@prisma/client";

import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { CompaniesService } from "./companies.service";

const mockUser: User = {
  id: "user-2",
  name: "Miembro",
  email: "miembro@test.com",
  passwordHash: "hash",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("CompaniesService", () => {
  let service: CompaniesService;
  let usersService: { findByEmail: jest.Mock<Promise<User | null>, [email: string]> };
  let prisma: {
    companyMembership: {
      findMany: jest.Mock<Promise<unknown>, [args: Prisma.CompanyMembershipFindManyArgs]>;
      findUnique: jest.Mock<Promise<unknown>, [args: Prisma.CompanyMembershipFindUniqueArgs]>;
      create: jest.Mock<Promise<unknown>, [args: Prisma.CompanyMembershipCreateArgs]>;
    };
    invitation: {
      findUnique: jest.Mock<Promise<unknown>, [args: Prisma.InvitationFindUniqueArgs]>;
      findMany: jest.Mock<Promise<unknown>, [args: Prisma.InvitationFindManyArgs]>;
      create: jest.Mock<Promise<unknown>, [args: Prisma.InvitationCreateArgs]>;
      delete: jest.Mock<Promise<unknown>, [args: Prisma.InvitationDeleteArgs]>;
      deleteMany: jest.Mock<Promise<unknown>, [args: Prisma.InvitationDeleteManyArgs]>;
    };
    company: {
      findUniqueOrThrow: jest.Mock<Promise<unknown>, [args: Prisma.CompanyFindUniqueOrThrowArgs]>;
    };
  };
  let mailService: {
    sendCompanyInvitation: jest.Mock<
      Promise<void>,
      [params: { to: string; companyName: string; registerUrl: string }]
    >;
  };

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn<Promise<User | null>, [email: string]>().mockResolvedValue(null),
    };

    prisma = {
      companyMembership: {
        findMany: jest
          .fn<Promise<unknown>, [Prisma.CompanyMembershipFindManyArgs]>()
          .mockResolvedValue([]),
        findUnique: jest.fn<Promise<unknown>, [Prisma.CompanyMembershipFindUniqueArgs]>(),
        create: jest
          .fn<Promise<unknown>, [Prisma.CompanyMembershipCreateArgs]>()
          .mockResolvedValue({}),
      },
      invitation: {
        findUnique: jest.fn<Promise<unknown>, [Prisma.InvitationFindUniqueArgs]>(),
        findMany: jest
          .fn<Promise<unknown>, [Prisma.InvitationFindManyArgs]>()
          .mockResolvedValue([]),
        create: jest.fn<Promise<unknown>, [Prisma.InvitationCreateArgs]>((args) =>
          Promise.resolve({
            id: "inv-1",
            token: "a".repeat(64),
            companyId: "company-1",
            email: args.data.email ?? "inv@test.com",
          }),
        ),
        delete: jest.fn<Promise<unknown>, [Prisma.InvitationDeleteArgs]>().mockResolvedValue({}),
        deleteMany: jest
          .fn<Promise<unknown>, [Prisma.InvitationDeleteManyArgs]>()
          .mockResolvedValue({ count: 0 }),
      },
      company: {
        findUniqueOrThrow: jest
          .fn<Promise<unknown>, [Prisma.CompanyFindUniqueOrThrowArgs]>()
          .mockResolvedValue({ name: "Empresa A" }),
      },
    };

    mailService = {
      sendCompanyInvitation: jest
        .fn<Promise<void>, [params: { to: string; companyName: string; registerUrl: string }]>()
        .mockResolvedValue(),
    };

    const configService = {
      get: jest.fn((key: string) => {
        switch (key) {
          case "INVITATION_TTL_SECONDS":
            return undefined;
          default:
            return undefined;
        }
      }),
      getOrThrow: jest.fn((key: string) => {
        switch (key) {
          case "FRONTEND_URL":
            return "http://localhost:3000";
          default:
            return undefined;
        }
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: usersService },
        { provide: MailService, useValue: mailService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(CompaniesService);
  });

  describe("listMembers", () => {
    it("lanza error si el usuario no pertenece a una empresa", async () => {
      await expect(service.listMembers(null)).rejects.toThrow(BadRequestException);
    });

    it("devuelve los miembros con su rol", async () => {
      prisma.companyMembership.findMany.mockResolvedValue([
        {
          user: { id: "user-1", name: "Owner", email: "owner@test.com" },
          role: "owner",
        },
        {
          user: { id: "user-2", name: "Miembro", email: "miembro@test.com" },
          role: "user",
        },
      ]);

      const members = await service.listMembers("company-1");

      expect(members).toEqual([
        { id: "user-1", name: "Owner", email: "owner@test.com", role: "owner" },
        { id: "user-2", name: "Miembro", email: "miembro@test.com", role: "user" },
      ]);
    });
  });

  describe("invite", () => {
    it("crea una invitación pendiente con fecha de expiración y envía el correo", async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);

      const before = Date.now();
      const result = await service.invite("company-1", "Nuevo@Test.com");
      const createArgs = prisma.invitation.create.mock.calls[0]?.[0];

      expect(createArgs?.data).toMatchObject({
        companyId: "company-1",
        email: "nuevo@test.com",
      });
      expect((createArgs?.data.expiresAt as Date).getTime()).toBeGreaterThan(before);
      expect((createArgs?.data.expiresAt as Date).getTime()).toBeGreaterThan(Date.now() + 3599_000);
      expect(mailService.sendCompanyInvitation).toHaveBeenCalledWith({
        to: "nuevo@test.com",
        companyName: "Empresa A",
        registerUrl: `http://localhost:3000/register/invitation?token=${"a".repeat(64)}`,
      });
      expect(result).toEqual({
        status: "pending",
        message: "Invitación enviada: revisa el correo para aceptarla",
      });
    });

    it("borra la invitación si el envío del correo falla", async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);
      mailService.sendCompanyInvitation.mockRejectedValue(new Error("SMTP caído"));

      await expect(service.invite("company-1", "nuevo@test.com")).rejects.toThrow("SMTP caído");
      expect(prisma.invitation.delete).toHaveBeenCalledWith({ where: { id: "inv-1" } });
    });

    it("rechaza una segunda invitación al mismo email", async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: "inv-1",
        companyId: "company-1",
        email: "nuevo@test.com",
        expiresAt: new Date(Date.now() + 3600_000),
      });

      await expect(service.invite("company-1", "nuevo@test.com")).rejects.toThrow(
        ConflictException,
      );
    });

    it("reemplaza una invitación expirada por una nueva", async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: "inv-1",
        companyId: "company-1",
        email: "nuevo@test.com",
        expiresAt: new Date(Date.now() - 60_000),
      });

      const result = await service.invite("company-1", "nuevo@test.com");

      expect(prisma.invitation.delete).toHaveBeenCalledWith({ where: { id: "inv-1" } });
      expect(prisma.invitation.create).toHaveBeenCalledTimes(1);
      expect(mailService.sendCompanyInvitation).toHaveBeenCalled();
      expect(result.status).toBe("pending");
    });

    it("deja la invitación pendiente si el email ya tiene cuenta", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      prisma.companyMembership.findUnique.mockResolvedValue(null);
      prisma.invitation.findUnique.mockResolvedValue(null);

      const result = await service.invite("company-1", "miembro@test.com");

      expect(prisma.companyMembership.create).not.toHaveBeenCalled();
      expect(prisma.invitation.create).toHaveBeenCalledTimes(1);
      expect(mailService.sendCompanyInvitation).toHaveBeenCalledWith({
        to: "miembro@test.com",
        companyName: "Empresa A",
        registerUrl: `http://localhost:3000/register/invitation?token=${"a".repeat(64)}`,
      });
      expect(result.status).toBe("pending");
    });

    it("rechaza invitar a un usuario que ya es miembro", async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      prisma.companyMembership.findUnique.mockResolvedValue({ role: "user" });

      await expect(service.invite("company-1", "miembro@test.com")).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it("no permite invitar a un admin", async () => {
      usersService.findByEmail.mockResolvedValue({ ...mockUser, role: "admin" });

      await expect(service.invite("company-1", "admin@test.com")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("lanza error si el usuario no pertenece a una empresa", async () => {
      await expect(service.invite(null, "nuevo@test.com")).rejects.toThrow(BadRequestException);
    });
  });

  describe("listPendingInvitations", () => {
    it("limpia las expiradas y devuelve las vigentes de la empresa", async () => {
      prisma.invitation.findMany.mockResolvedValue([
        { id: "inv-1", email: "a@test.com", createdAt: new Date("2026-08-01") },
      ]);

      const invitations = await service.listPendingInvitations("company-1");

      const deleteArgs = prisma.invitation.deleteMany.mock.calls[0]?.[0];
      expect(deleteArgs?.where).toMatchObject({ companyId: "company-1" });
      expect(prisma.invitation.findMany).toHaveBeenCalledWith({
        where: { companyId: "company-1" },
        orderBy: { createdAt: "desc" },
        select: { id: true, email: true, createdAt: true },
      });
      expect(invitations).toHaveLength(1);
    });

    it("lanza error si el usuario no pertenece a una empresa", async () => {
      await expect(service.listPendingInvitations(null)).rejects.toThrow(BadRequestException);
    });
  });

  describe("cancelInvitation", () => {
    it("cancela una invitación pendiente de su propia empresa", async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: "inv-1",
        companyId: "company-1",
        email: "a@test.com",
      });

      const result = await service.cancelInvitation("company-1", "inv-1");

      expect(prisma.invitation.delete).toHaveBeenCalledWith({ where: { id: "inv-1" } });
      expect(result.status).toBe("cancelled");
    });

    it("no permite cancelar la invitación de otra empresa", async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: "inv-1",
        companyId: "company-2",
        email: "a@test.com",
      });

      await expect(service.cancelInvitation("company-1", "inv-1")).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.invitation.delete).not.toHaveBeenCalled();
    });

    it("lanza error si la invitación no existe", async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);

      await expect(service.cancelInvitation("company-1", "inv-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
