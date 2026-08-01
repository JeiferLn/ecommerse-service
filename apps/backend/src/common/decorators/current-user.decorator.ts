import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import type { AuthenticatedUser } from "../../auth/auth.types";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined => {
    return context.switchToHttp().getRequest<Request>().user;
  },
);
