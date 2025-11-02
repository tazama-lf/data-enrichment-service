import { SetMetadata } from '@nestjs/common';

export const CLAIMS_KEY = 'claims';
export const ANY_CLAIMS_KEY = 'anyClaims';

/**
 * Decorator to specify required claims for a route
 * @param claims - Array of required claims (all must be present)
 */
export const RequireClaims = (...claims: string[]) => SetMetadata(CLAIMS_KEY, claims);

/**
 * Decorator to specify claims where ANY of them can satisfy the requirement
 * @param claims - Array of claims (user needs at least one)
 */
export const RequireAnyClaims = (...claims: string[]) => SetMetadata(ANY_CLAIMS_KEY, claims);

/**
 * Decorator to specify a single claim requirement
 * @param claim - Single required claim
 */
export const RequireClaim = (claim: string) => SetMetadata(CLAIMS_KEY, [claim]);

/**
 * Common Tazama claims for convenience
 */
export const TazamaClaims = {
  EDITOR: 'editor',
};

/**
 * Convenience decorators for common Event Monitoring Service roles
 */
export const RequireEditorRole = () => RequireClaim(TazamaClaims.EDITOR);
