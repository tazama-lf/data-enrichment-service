import type { TazamaToken, ClaimValidationResult } from '@tazama-lf/auth-lib';
import type { Request as ExpressRequest } from 'express';
export interface AuthenticatedUser {
  token: TazamaToken;
  validated: ClaimValidationResult;
  validClaims: string[];
}

export interface RequestWithUser extends ExpressRequest {
  user?: AuthenticatedUser;
}

export type { ClaimValidationResult, TazamaToken };
