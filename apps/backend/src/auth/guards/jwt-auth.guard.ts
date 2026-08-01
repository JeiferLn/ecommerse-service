import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

import { IS_PUBLIC_KEY } from "../../common/decorators/public.decorator";
import { ACCESS_TOKEN_COOKIE } from "../auth.constants";
import type { AccessTokenPayload } from "../auth.types";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = (request.cookies as Record<string, string> | undefined)?.[ACCESS_TOKEN_COOKIE];

    if (!token) {
      throw new UnauthorizedException("No autenticado");
    }

    try {
      const payload = this.jwtService.verify<AccessTokenPayload>(token);
      request.user = {
        id: payload.sub,
        role: payload.role,
        companyId: payload.companyId,
      };
      return true;
    } catch {
      throw new UnauthorizedException("Token inválido o expirado");
    }
  }
}
