import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CompaniesService } from '../companies/companies.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn().mockResolvedValue(true),
}));

const user = {
  id: 'user-1',
  email: 'owner@empresa.com',
  name: 'Owner',
  passwordHash: 'hashed',
  role: Role.OWNER,
  isActive: true,
  companyId: 'company-1',
  company: { id: 'company-1', name: 'Empresa', type: 'RETAIL' },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const company = {
  id: 'company-1',
  name: 'Empresa',
  type: 'RETAIL',
  phone: null,
  address: null,
  timezone: 'America/Bogota',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function createMocks() {
  const usersService = {
    create: jest.fn(),
    findByEmail: jest.fn(),
    findById: jest.fn(),
    isUniqueConstraintError: jest.fn(),
  };

  const companiesService = {
    create: jest.fn(),
    acceptInvitation: jest.fn(),
  };

  const prisma = {
    $transaction: jest.fn(),
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('access-token'),
  };

  const config = {
    get: jest.fn((_key: string, fallback: string) => fallback),
    getOrThrow: jest.fn(() => 'secret'),
  };

  const service = new AuthService(
    usersService as unknown as UsersService,
    companiesService as unknown as CompaniesService,
    prisma as unknown as PrismaService,
    jwtService as unknown as JwtService,
    config as unknown as ConfigService,
  );

  return {
    service,
    usersService,
    companiesService,
    prisma,
    jwtService,
    config,
  };
}

describe('AuthService', () => {
  const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedBcrypt.hash.mockResolvedValue('hashed' as never);
    mockedBcrypt.compare.mockResolvedValue(true as never);
  });

  describe('register', () => {
    it('crea empresa y usuario OWNER, y emite tokens', async () => {
      const { service, usersService, companiesService, prisma } = createMocks();
      const tx = {};
      prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(tx));
      companiesService.create = jest.fn().mockResolvedValue(company);
      usersService.create = jest.fn().mockResolvedValue(user);
      prisma.refreshToken.create = jest.fn().mockResolvedValue({ id: 'rt' });

      const result = await service.register({
        email: '  Owner@Empresa.com ',
        name: '  Owner  ',
        password: 'password123',
        companyName: '  Empresa  ',
        companyType: 'RETAIL',
      });

      expect(companiesService.create).toHaveBeenCalledWith(
        { name: 'Empresa', type: 'RETAIL' },
        tx,
      );
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'owner@empresa.com',
          role: Role.OWNER,
          companyId: 'company-1',
        }),
        tx,
      );
      expect(prisma.refreshToken.create).toHaveBeenCalled();
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.user).toBe(user);
    });

    it('lanza ConflictException cuando el correo ya está registrado', async () => {
      const { service, companiesService, usersService, prisma } = createMocks();
      const tx = {};
      prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(tx));
      companiesService.create = jest.fn().mockResolvedValue(company);
      usersService.create = jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );
      usersService.isUniqueConstraintError = jest.fn().mockReturnValue(true);

      await expect(
        service.register({
          email: 'owner@empresa.com',
          name: 'Owner',
          password: 'password123',
          companyName: 'Empresa',
          companyType: 'RETAIL',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('devuelve tokens con un usuario activo y contraseña válida', async () => {
      const { service, usersService, prisma } = createMocks();
      usersService.findByEmail = jest.fn().mockResolvedValue(user);
      prisma.refreshToken.create = jest.fn().mockResolvedValue({ id: 'rt' });

      const result = await service.login({
        email: 'Owner@Empresa.com',
        password: 'password123',
      });

      expect(usersService.findByEmail).toHaveBeenCalledWith(
        'owner@empresa.com',
      );
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashed');
      expect(result.accessToken).toBe('access-token');
      expect(result.user.role).toBe(Role.OWNER);
    });

    it('lanza UnauthorizedException con contraseña inválida', async () => {
      const { service, usersService } = createMocks();
      usersService.findByEmail = jest.fn().mockResolvedValue(user);
      mockedBcrypt.compare.mockResolvedValue(false as never);

      await expect(
        service.login({ email: 'owner@empresa.com', password: 'wrongpass' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lanza UnauthorizedException con usuario inactivo', async () => {
      const { service, usersService } = createMocks();
      usersService.findByEmail = jest
        .fn()
        .mockResolvedValue({ ...user, isActive: false });

      await expect(
        service.login({ email: 'owner@empresa.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('lanza UnauthorizedException si el usuario no existe', async () => {
      const { service, usersService } = createMocks();
      usersService.findByEmail = jest.fn().mockResolvedValue(null);

      await expect(
        service.login({ email: 'owner@empresa.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    const stored = {
      id: 'rt-1',
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: {
        id: 'user-1',
        email: 'owner@empresa.com',
        role: Role.OWNER,
        companyId: 'company-1',
        isActive: true,
      },
    };

    it('rota el token: revoca el anterior y emite uno nuevo', async () => {
      const { service, prisma } = createMocks();
      prisma.refreshToken.findUnique = jest.fn().mockResolvedValue(stored);
      prisma.refreshToken.update = jest.fn().mockResolvedValue({});
      prisma.refreshToken.create = jest.fn().mockResolvedValue({ id: 'rt-2' });

      const result = await service.refresh('valid-token');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
      expect(prisma.refreshToken.create).toHaveBeenCalled();
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBeDefined();
    });

    it('lanza UnauthorizedException si el token está revocado', async () => {
      const { service, prisma } = createMocks();
      prisma.refreshToken.findUnique = jest
        .fn()
        .mockResolvedValue({ ...stored, revokedAt: new Date() });

      await expect(service.refresh('valid-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('lanza UnauthorizedException si el token expiró', async () => {
      const { service, prisma } = createMocks();
      prisma.refreshToken.findUnique = jest
        .fn()
        .mockResolvedValue({ ...stored, expiresAt: new Date(Date.now() - 1) });

      await expect(service.refresh('valid-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('lanza UnauthorizedException si el token no existe', async () => {
      const { service, prisma } = createMocks();
      prisma.refreshToken.findUnique = jest.fn().mockResolvedValue(null);

      await expect(service.refresh('valid-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('lanza UnauthorizedException si el usuario está inactivo', async () => {
      const { service, prisma } = createMocks();
      prisma.refreshToken.findUnique = jest.fn().mockResolvedValue({
        ...stored,
        user: { ...stored.user, isActive: false },
      });

      await expect(service.refresh('valid-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revoca el refresh token', async () => {
      const { service, prisma } = createMocks();
      prisma.refreshToken.updateMany = jest
        .fn()
        .mockResolvedValue({ count: 1 });

      const result = await service.logout('valid-token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: expect.any(String), revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
      expect(result).toEqual({ success: true });
    });
  });

  describe('me', () => {
    it('devuelve el usuario activo', async () => {
      const { service, usersService } = createMocks();
      usersService.findById = jest.fn().mockResolvedValue(user);

      await expect(service.me('user-1')).resolves.toBe(user);
    });

    it('lanza UnauthorizedException si el usuario está inactivo', async () => {
      const { service, usersService } = createMocks();
      usersService.findById = jest
        .fn()
        .mockResolvedValue({ ...user, isActive: false });

      await expect(service.me('user-1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('lanza UnauthorizedException si el usuario no existe', async () => {
      const { service, usersService } = createMocks();
      usersService.findById = jest.fn().mockResolvedValue(null);

      await expect(service.me('user-1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
