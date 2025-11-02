import { SetMetadata } from '@nestjs/common';
import {
  RequireClaims,
  CLAIMS_KEY,
  RequireAnyClaims,
  ANY_CLAIMS_KEY,
  RequireClaim,
  RequireEditorRole,
  TazamaClaims,
} from './auth.decorator';

jest.mock('@nestjs/common', () => ({
  SetMetadata: jest.fn(),
}));

describe('Auth Decorators', () => {
  const mockSetMetadata = SetMetadata as jest.MockedFunction<typeof SetMetadata>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('RequireClaims', () => {
    it('should call SetMetadata with correct parameters for single claim', () => {
      const mockDecorator = { KEY: 'test' } as any;
      mockSetMetadata.mockReturnValue(mockDecorator);

      const result = RequireClaims('test:claim');

      expect(mockSetMetadata).toHaveBeenCalledWith(CLAIMS_KEY, ['test:claim']);
      expect(result).toBe(mockDecorator);
    });

    it('should call SetMetadata with correct parameters for multiple claims', () => {
      const mockDecorator = { KEY: 'test' } as any;
      mockSetMetadata.mockReturnValue(mockDecorator);

      const result = RequireClaims('claim1', 'claim2', 'claim3');

      expect(mockSetMetadata).toHaveBeenCalledWith(CLAIMS_KEY, ['claim1', 'claim2', 'claim3']);
      expect(result).toBe(mockDecorator);
    });

    it('should handle empty claims array', () => {
      const mockDecorator = { KEY: 'test' } as any;
      mockSetMetadata.mockReturnValue(mockDecorator);

      const result = RequireClaims();

      expect(mockSetMetadata).toHaveBeenCalledWith(CLAIMS_KEY, []);
      expect(result).toBe(mockDecorator);
    });

    it('should handle special characters in claims', () => {
      const mockDecorator = { KEY: 'test' } as any;
      mockSetMetadata.mockReturnValue(mockDecorator);

      const result = RequireClaims('namespace:action', 'service-name:read', 'app/module:write');

      expect(mockSetMetadata).toHaveBeenCalledWith(CLAIMS_KEY, ['namespace:action', 'service-name:read', 'app/module:write']);
      expect(result).toBe(mockDecorator);
    });

    it('should handle duplicate claims', () => {
      const mockDecorator = { KEY: 'test' } as any;
      mockSetMetadata.mockReturnValue(mockDecorator);

      const result = RequireClaims('duplicate', 'duplicate', 'unique');

      expect(mockSetMetadata).toHaveBeenCalledWith(CLAIMS_KEY, ['duplicate', 'duplicate', 'unique']);
      expect(result).toBe(mockDecorator);
    });
  });

  describe('CLAIMS_KEY', () => {
    it('should have the correct value', () => {
      expect(CLAIMS_KEY).toBe('claims');
    });

    it('should be a string', () => {
      expect(typeof CLAIMS_KEY).toBe('string');
    });
  });

  describe('RequireAnyClaims', () => {
    it('should call SetMetadata with correct parameters for single claim', () => {
      const mockDecorator = { KEY: 'test' } as any;
      mockSetMetadata.mockReturnValue(mockDecorator);

      const result = RequireAnyClaims('test:claim');

      expect(mockSetMetadata).toHaveBeenCalledWith(ANY_CLAIMS_KEY, ['test:claim']);
      expect(result).toBe(mockDecorator);
    });

    it('should call SetMetadata with correct parameters for multiple claims', () => {
      const mockDecorator = { KEY: 'test' } as any;
      mockSetMetadata.mockReturnValue(mockDecorator);

      const result = RequireAnyClaims('claim1', 'claim2', 'claim3');

      expect(mockSetMetadata).toHaveBeenCalledWith(ANY_CLAIMS_KEY, ['claim1', 'claim2', 'claim3']);
      expect(result).toBe(mockDecorator);
    });

    it('should handle empty claims array', () => {
      const mockDecorator = { KEY: 'test' } as any;
      mockSetMetadata.mockReturnValue(mockDecorator);

      const result = RequireAnyClaims();

      expect(mockSetMetadata).toHaveBeenCalledWith(ANY_CLAIMS_KEY, []);
      expect(result).toBe(mockDecorator);
    });
  });

  describe('RequireClaim', () => {
    it('should call SetMetadata with single claim wrapped in array', () => {
      const mockDecorator = { KEY: 'test' } as any;
      mockSetMetadata.mockReturnValue(mockDecorator);

      const result = RequireClaim('single:claim');

      expect(mockSetMetadata).toHaveBeenCalledWith(CLAIMS_KEY, ['single:claim']);
      expect(result).toBe(mockDecorator);
    });

    it('should handle claim with special characters', () => {
      const mockDecorator = { KEY: 'test' } as any;
      mockSetMetadata.mockReturnValue(mockDecorator);

      const result = RequireClaim('app/resource:action');

      expect(mockSetMetadata).toHaveBeenCalledWith(CLAIMS_KEY, ['app/resource:action']);
      expect(result).toBe(mockDecorator);
    });
  });

  describe('RequireEditorRole', () => {
    it('should call SetMetadata with EDITOR claim', () => {
      const mockDecorator = { KEY: 'test' } as any;
      mockSetMetadata.mockReturnValue(mockDecorator);

      const result = RequireEditorRole();

      expect(mockSetMetadata).toHaveBeenCalledWith(CLAIMS_KEY, [TazamaClaims.EDITOR]);
      expect(result).toBe(mockDecorator);
    });

    it('should return the same decorator as SetMetadata', () => {
      const mockDecorator = { KEY: 'test' } as any;
      mockSetMetadata.mockReturnValue(mockDecorator);

      const result = RequireEditorRole();

      expect(result).toBe(mockDecorator);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long claim names', () => {
      const mockDecorator = { KEY: 'test' } as any;
      mockSetMetadata.mockReturnValue(mockDecorator);

      const longClaim = 'a'.repeat(1000) + ':' + 'b'.repeat(1000);
      const result = RequireClaims(longClaim);

      expect(mockSetMetadata).toHaveBeenCalledWith(CLAIMS_KEY, [longClaim]);
      expect(result).toBe(mockDecorator);
    });

    it('should handle claims with Unicode characters', () => {
      const mockDecorator = { KEY: 'test' } as any;
      mockSetMetadata.mockReturnValue(mockDecorator);

      const unicodeClaims = ['测试:读取', 'тест:запись', '🔐:access'];
      const result = RequireClaims(...unicodeClaims);

      expect(mockSetMetadata).toHaveBeenCalledWith(CLAIMS_KEY, unicodeClaims);
      expect(result).toBe(mockDecorator);
    });

    it('should handle claims with whitespace', () => {
      const mockDecorator = { KEY: 'test' } as any;
      mockSetMetadata.mockReturnValue(mockDecorator);

      const whitespaceClaims = [' claim with spaces ', '\tclaim\twith\ttabs\t', '\nclaim\nwith\nnewlines\n'];
      const result = RequireClaims(...whitespaceClaims);

      expect(mockSetMetadata).toHaveBeenCalledWith(CLAIMS_KEY, whitespaceClaims);
      expect(result).toBe(mockDecorator);
    });
  });
});
