import { TazamaToken, ClaimValidationResult } from '@tazama-lf/auth-lib';

export interface AuthenticatedUser {
  token: TazamaToken;
  validated: ClaimValidationResult;
  validClaims: string[];
}

export type { ClaimValidationResult, TazamaToken };
