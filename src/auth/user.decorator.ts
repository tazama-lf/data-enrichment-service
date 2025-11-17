import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser, RequestWithUser } from './auth.types';

// Export the callback function separately for testing
export const getUserFromContext = (data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  return request.user;
};

export const User = createParamDecorator(getUserFromContext);
