import { SetMetadata } from '@nestjs/common';
import { RequireClaims, CLAIMS_KEY, EventMonitoringClaims, RequireDemsWriteRole } from './auth.decorator';

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

  describe('EventMonitoringClaims', () => {
    it('should have DEMS_WRITE claim', () => {
      expect(EventMonitoringClaims.DEMS_WRITE).toBe('dems:write');
    });

    it('should be readonly object', () => {
      expect(() => {
        (EventMonitoringClaims as any).DEMS_WRITE = 'modified';
      }).toThrow();
    });

    it('should have correct structure', () => {
      expect(Object.keys(EventMonitoringClaims)).toEqual(['DEMS_WRITE']);
    });
  });

  describe('RequireDemsWriteRole', () => {
    it('should call RequireClaims with DEMS_WRITE claim', () => {
      const mockDecorator = { KEY: 'test' } as any;
      mockSetMetadata.mockReturnValue(mockDecorator);

      const result = RequireDemsWriteRole();

      expect(mockSetMetadata).toHaveBeenCalledWith(CLAIMS_KEY, [EventMonitoringClaims.DEMS_WRITE]);
      expect(result).toBe(mockDecorator);
    });

    it('should return the same decorator as SetMetadata', () => {
      const mockDecorator = { KEY: 'test' } as any;
      mockSetMetadata.mockReturnValue(mockDecorator);

      const result = RequireDemsWriteRole();

      expect(result).toBe(mockDecorator);
    });
  });

  describe('Integration Tests', () => {
    it('should work with multiple decorators', () => {
      const mockDecorator1 = { KEY: 'test1' } as any;
      const mockDecorator2 = { KEY: 'test2' } as any;
      mockSetMetadata.mockReturnValueOnce(mockDecorator1).mockReturnValueOnce(mockDecorator2);

      const decorator1 = RequireClaims('claim1');
      const decorator2 = RequireDemsWriteRole();

      expect(decorator1).toBe(mockDecorator1);
      expect(decorator2).toBe(mockDecorator2);
      expect(mockSetMetadata).toHaveBeenCalledTimes(2);
    });

    it('should handle complex claim combinations', () => {
      const mockDecorator = { KEY: 'test' } as any;
      mockSetMetadata.mockReturnValue(mockDecorator);

      const complexClaims = ['admin:full-access', 'user:read', 'user:write', 'service:execute', EventMonitoringClaims.DEMS_WRITE];

      const result = RequireClaims(...complexClaims);

      expect(mockSetMetadata).toHaveBeenCalledWith(CLAIMS_KEY, complexClaims);
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
