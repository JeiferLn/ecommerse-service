import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';

function createStrategy(userResult: unknown) {
  const config = {
    getOrThrow: jest.fn(() => 'secret'),
  } as unknown as ConfigService;

  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(userResult) },
  };

  return {
    strategy: new JwtStrategy(config, prisma as unknown as PrismaService),
    prisma,
  };
}

describe('JwtStrategy', () => {
  const payload = {
    sub: 'user-1',
    email: 'owner@empresa.com',
    role: Role.OWNER,
    companyId: 'company-1',
  };

  it('devuelve el usuario autenticado a partir del payload', async () => {
    const { strategy, prisma } = createStrategy({
      id: 'user-1',
      email: 'owner@empresa.com',
      role: Role.OWNER,
      companyId: 'company-1',
      isActive: true,
    });

    const result = await strategy.validate(payload);
    const findUnique = prisma.user.findUnique;

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: expect.objectContaining({ id: true, isActive: true }),
    });
    expect(result).toEqual({
      id: 'user-1',
      email: 'owner@empresa.com',
      role: Role.OWNER,
      companyId: 'company-1',
    });
  });

  it('lanza UnauthorizedException si el usuario no existe', async () => {
    const { strategy } = createStrategy(null);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('lanza UnauthorizedException si el usuario está inactivo', async () => {
    const { strategy } = createStrategy({
      id: 'user-1',
      email: 'owner@empresa.com',
      role: Role.OWNER,
      companyId: 'company-1',
      isActive: false,
    });

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
