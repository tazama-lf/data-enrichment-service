import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClaimValidationResult, TazamaToken, validateTokenAndClaims } from '@tazama-lf/auth-lib';
import * as jwt from 'jsonwebtoken';
import { CLAIMS_KEY } from './auth.decorator';
import { AuthenticatedUser, RequestWithUser } from './auth.types';

@Injectable()
export class TazamaAuthGuard implements CanActivate {
  private readonly logger = new Logger(TazamaAuthGuard.name);

  private readonly LOG_CONTEXT = `${TazamaAuthGuard.name}.canActivate`;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredClaims = this.reflector.getAllAndOverride<string[]>(CLAIMS_KEY, [context.getHandler(), context.getClass()]);

    const request: RequestWithUser = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader: string | undefined = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      this.logger.warn('No Bearer token provided', this.LOG_CONTEXT);
      throw new UnauthorizedException('No Bearer token provided');
    }

    if (requiredClaims.length === 0) {
      this.logger.warn('No required claims specified for protected route', this.LOG_CONTEXT);
      throw new UnauthorizedException('No required claims specified');
    }

    try {
      const tokenParts = authHeader.split(' ');
      if (tokenParts.length !== 2) {
        this.logger.warn('Malformed authorization header', this.LOG_CONTEXT);
        throw new UnauthorizedException('Malformed authorization header');
      }

      const [, token] = tokenParts;

      const claimsToValidate = requiredClaims;

      const validated: ClaimValidationResult = validateTokenAndClaims(token, claimsToValidate);

      let hasValidAccess = false;
      let validClaims: string[] = [];
      let invalidClaims: string[] = [];

      if (requiredClaims.length > 0) {
        const hasAllClaims = requiredClaims.every((claim) => validated[claim]);
        validClaims = requiredClaims.filter((claim) => validated[claim]);
        invalidClaims = requiredClaims.filter((claim) => !validated[claim]);
        hasValidAccess = hasAllClaims;

        if (!hasAllClaims) {
          this.logger.warn(
            `User missing required claims. Required: [${requiredClaims.join(', ')}], Invalid: [${invalidClaims.join(', ')}]`,
            this.LOG_CONTEXT,
          );
        }
      }

      if (!hasValidAccess) {
        throw new UnauthorizedException(`Missing or invalid claims: ${invalidClaims.join(', ')}`);
      }

      const decodedToken = this.extractTokenPayload(token);

      const authenticatedUser: AuthenticatedUser = {
        token: decodedToken,
        validated,
        validClaims,
      };

      request.user = authenticatedUser;

      this.logger.log(
        `Authentication successful for clientId: ${decodedToken.clientId}, tenantId: ${decodedToken.tenantId}, claims: [${validClaims.join(', ')}]`,
        this.LOG_CONTEXT,
      );

      return true;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Authentication failed: ${err.name}: ${err.message}`, this.LOG_CONTEXT);

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid token format');
    }
  }

  private extractTokenPayload(token: string): TazamaToken {
    try {
      const decoded = jwt.decode(token) as TazamaToken | null;
      if (!decoded) {
        throw new Error('Failed to decode token');
      }

      if (!decoded.clientId) {
        throw new Error('Token missing clientId');
      }
      if (!decoded.tenantId) {
        throw new Error('Token missing tenantId');
      }
      if (!Array.isArray(decoded.claims)) {
        throw new Error('Token missing or invalid claims array');
      }
      return decoded;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to extract token payload: ${err.message}`);
      throw new UnauthorizedException('Invalid token format');
    }
  }
}
