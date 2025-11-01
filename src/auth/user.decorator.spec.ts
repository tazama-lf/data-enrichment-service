import { ExecutionContext } from '@nestjs/common';
import { User, getUserFromContext } from './user.decorator';

describe('User Decorator', () => {
  let mockExecutionContext: jest.Mocked<ExecutionContext>;
  let mockRequest: any;

  beforeEach(() => {
    mockRequest = {
      user: {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        roles: ['admin', 'user'],
      },
    };

    const mockHttpArgumentsHost = {
      getRequest: jest.fn().mockReturnValue(mockRequest),
      getResponse: jest.fn(),
      getNext: jest.fn(),
    };

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue(mockHttpArgumentsHost),
      getClass: jest.fn(),
      getHandler: jest.fn(),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
      getType: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('User Decorator Factory', () => {
    it('should be defined', () => {
      expect(User).toBeDefined();
    });

    it('should be a function (parameter decorator)', () => {
      expect(typeof User).toBe('function');
    });
  });

  describe('User Decorator Execution', () => {
    it('should return user object from request', () => {
      const result = getUserFromContext(undefined, mockExecutionContext);

      expect(result).toBe(mockRequest.user);
      expect(result).toEqual({
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        roles: ['admin', 'user'],
      });
    });

    it('should call switchToHttp on execution context', () => {
      getUserFromContext(undefined, mockExecutionContext);

      expect(mockExecutionContext.switchToHttp).toHaveBeenCalledTimes(1);
    });

    it('should call getRequest on http arguments host', () => {
      const httpHost = mockExecutionContext.switchToHttp();
      getUserFromContext(undefined, mockExecutionContext);

      expect(httpHost.getRequest).toHaveBeenCalledTimes(1);
    });

    it('should return undefined when user is not set on request', () => {
      mockRequest.user = undefined;

      const result = getUserFromContext(undefined, mockExecutionContext);

      expect(result).toBeUndefined();
    });

    it('should return null when user is null on request', () => {
      mockRequest.user = null;

      const result = getUserFromContext(undefined, mockExecutionContext);

      expect(result).toBeNull();
    });

    it('should handle complex user objects', () => {
      const complexUser = {
        id: 'complex-user-456',
        profile: {
          personal: {
            firstName: 'John',
            lastName: 'Doe',
            dateOfBirth: '1990-01-01',
          },
          professional: {
            company: 'Test Corp',
            department: 'Engineering',
            role: 'Developer',
          },
        },
        permissions: {
          read: ['resource1', 'resource2'],
          write: ['resource1'],
          admin: false,
        },
        metadata: {
          lastLogin: '2024-01-01T00:00:00Z',
          sessionTimeout: 3600,
          preferences: {
            theme: 'dark',
            language: 'en',
          },
        },
      };

      mockRequest.user = complexUser;

      const result = getUserFromContext(undefined, mockExecutionContext);

      expect(result).toBe(complexUser);
      expect(result).toEqual(complexUser);
    });

    it('should handle different primitive types as user', () => {
      const primitiveValues = ['string-user', 42, true, false, 0, '', [], {}];

      for (const value of primitiveValues) {
        mockRequest.user = value;

        const result = getUserFromContext(undefined, mockExecutionContext);

        expect(result).toBe(value);
      }
    });
  });

  describe('Data Parameter Handling', () => {
    it('should ignore data parameter and return full user object', () => {
      const result = getUserFromContext('someData', mockExecutionContext);

      expect(result).toBe(mockRequest.user);
    });

    it('should work with null data parameter', () => {
      const result = getUserFromContext(null, mockExecutionContext);

      expect(result).toBe(mockRequest.user);
    });

    it('should work with undefined data parameter', () => {
      const result = getUserFromContext(undefined, mockExecutionContext);

      expect(result).toBe(mockRequest.user);
    });

    it('should work with complex data parameter', () => {
      const complexData = {
        field: 'value',
        nested: { deep: 'object' },
      };

      const result = getUserFromContext(complexData, mockExecutionContext);

      expect(result).toBe(mockRequest.user);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing request object gracefully', () => {
      const mockHttpHost = {
        getRequest: jest.fn().mockReturnValue(undefined),
        getResponse: jest.fn(),
        getNext: jest.fn(),
      };

      mockExecutionContext.switchToHttp.mockReturnValue(mockHttpHost);

      expect(() => {
        getUserFromContext(undefined, mockExecutionContext);
      }).toThrow();
    });

    it('should handle request object without user property', () => {
      const requestWithoutUser = {
        headers: {},
        body: {},
        params: {},
      };

      const mockHttpHost = {
        getRequest: jest.fn().mockReturnValue(requestWithoutUser),
        getResponse: jest.fn(),
        getNext: jest.fn(),
      };

      mockExecutionContext.switchToHttp.mockReturnValue(mockHttpHost);

      const result = getUserFromContext(undefined, mockExecutionContext);

      expect(result).toBeUndefined();
    });

    it('should handle null execution context', () => {
      expect(() => {
        getUserFromContext(undefined, null as any);
      }).toThrow();
    });
  });

  describe('Integration with Authentication', () => {
    it('should work with authenticated user object', () => {
      const authenticatedUser = {
        token: {
          clientId: 'client-123',
          tenantId: 'tenant-456',
          claims: ['read:data', 'write:data'],
        },
        validated: {
          'read:data': true,
          'write:data': true,
        },
        validClaims: ['read:data', 'write:data'],
      };

      mockRequest.user = authenticatedUser;

      const result = getUserFromContext(undefined, mockExecutionContext);

      expect(result).toBe(authenticatedUser);
      expect(result.token.clientId).toBe('client-123');
      expect(result.validClaims).toContain('read:data');
    });

    it('should work with JWT payload user', () => {
      const jwtUser = {
        sub: 'user-789',
        iat: 1640995200,
        exp: 1641081600,
        iss: 'auth-server',
        aud: 'client-app',
        claims: ['admin', 'user'],
        tenantId: 'tenant-123',
      };

      mockRequest.user = jwtUser;

      const result = getUserFromContext(undefined, mockExecutionContext);

      expect(result).toBe(jwtUser);
      expect(result.sub).toBe('user-789');
      expect(result.tenantId).toBe('tenant-123');
    });
  });

  describe('Performance Considerations', () => {
    it('should not modify the original user object', () => {
      const originalUser = { id: 'test', name: 'Test' };
      mockRequest.user = originalUser;

      const result = getUserFromContext(undefined, mockExecutionContext);

      expect(result).toBe(originalUser);

      result.modified = true;
      expect((originalUser as any).modified).toBe(true);
    });

    it('should be fast for repeated calls', () => {
      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        getUserFromContext(undefined, mockExecutionContext);
      }
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100);
    });
  });

  describe('Type Safety', () => {
    it('should handle strongly typed user objects', () => {
      interface TypedUser {
        id: string;
        email: string;
        roles: string[];
      }

      const typedUser: TypedUser = {
        id: 'typed-user',
        email: 'typed@example.com',
        roles: ['admin'],
      };

      mockRequest.user = typedUser;

      const result = getUserFromContext(undefined, mockExecutionContext);

      expect(result).toBe(typedUser);
      expect(typeof result.id).toBe('string');
      expect(Array.isArray(result.roles)).toBe(true);
    });
  });
});
