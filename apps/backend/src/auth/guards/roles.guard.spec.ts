import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { AuthUser } from '../decorators/current-user.decorator';
import { RolesGuard } from './roles.guard';

function makeContext(user: AuthUser | undefined, requiredRoles?: Role[]) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;

  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never;

  return { guard: new RolesGuard(reflector), context };
}

describe('RolesGuard', () => {
  it('permite el acceso cuando no hay roles requeridos', () => {
    const { guard, context } = makeContext({
      id: 'user-1',
      email: 'a@b.c',
      role: Role.MEMBER,
      companyId: 'company-1',
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('permite el acceso cuando el rol del usuario coincide', () => {
    const { guard, context } = makeContext(
      {
        id: 'user-1',
        email: 'a@b.c',
        role: Role.OWNER,
        companyId: 'company-1',
      },
      [Role.OWNER, Role.MEMBER],
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('lanza ForbiddenException cuando el rol no coincide', () => {
    const { guard, context } = makeContext(
      {
        id: 'user-1',
        email: 'a@b.c',
        role: Role.MEMBER,
        companyId: 'company-1',
      },
      [Role.ADMIN],
    );

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException cuando no hay usuario autenticado', () => {
    const { guard, context } = makeContext(undefined, [Role.ADMIN]);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
