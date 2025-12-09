import { SetMetadata } from '@nestjs/common';

export const CLAIMS_KEY = 'claims';
export const ANY_CLAIMS_KEY = 'anyClaims';

export const RequireClaims = (...claims: string[]): ReturnType<typeof SetMetadata> => SetMetadata(CLAIMS_KEY, claims);

export const RequireAnyClaims = (...claims: string[]): ReturnType<typeof SetMetadata> => SetMetadata(ANY_CLAIMS_KEY, claims);

export const RequireClaim = (claim: string): ReturnType<typeof SetMetadata> => SetMetadata(CLAIMS_KEY, [claim]);

export const TazamaClaims = {
  EDITOR: 'editor',
};

export const RequireEditorRole = (): ReturnType<typeof SetMetadata> => RequireClaim(TazamaClaims.EDITOR);
