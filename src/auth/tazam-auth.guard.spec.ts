import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { validateTokenAndClaims } from '@tazama-lf/auth-lib';
import { decode } from 'jsonwebtoken';
import { CLAIMS_KEY } from './auth.decorator';
import { TazamaAuthGuard } from './tazam-auth.guard';

jest.mock('@tazama-lf/auth-lib');
jest.mock('jsonwebtoken');

describe('TazamaAuthGuard', () => {
  let guard: TazamaAuthGuard;
  let mockReflector: jest.Mocked<Reflector>;
  let mockExecutionContext: jest.Mocked<ExecutionContext>;
  let mockRequest: any;

  const mockValidateTokenAndClaims = validateTokenAndClaims as jest.MockedFunction<typeof validateTokenAndClaims>;
  const mockDecode = decode;

  beforeEach(async () => {
    mockReflector = {
      getAllAndOverride: jest.fn(),
      get: jest.fn(),
      getAll: jest.fn(),
      getAllAndMerge: jest.fn(),
    } as any;

    mockRequest = {
      headers: {
        authorization: 'Bearer valid-token',
      },
    };

    const mockHttpArgumentsHost = {
      getRequest: jest.fn().mockReturnValue(mockRequest),
      getResponse: jest.fn(),
      getNext: jest.fn(),
    };

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue(mockHttpArgumentsHost),
      getHandler: jest.fn(),
      getClass: jest.fn(),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
      getType: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [TazamaAuthGuard, { provide: Reflector, useValue: mockReflector }],
    }).compile();

    guard = module.get<TazamaAuthGuard>(TazamaAuthGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should be defined', () => {
      expect(guard).toBeDefined();
    });

    it('should have reflector injected', () => {
      expect((guard as any).reflector).toBe(mockReflector);
    });
  });

  describe('canActivate - Authorization Header Validation', () => {
    it('should throw UnauthorizedException when no authorization header', async () => {
      mockRequest.headers = {};
      mockReflector.getAllAndOverride.mockReturnValue(['test:claim']);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(new UnauthorizedException('No Bearer token provided'));
    });

    it('should throw UnauthorizedException when authorization header does not start with Bearer', async () => {
      mockRequest.headers.authorization = 'Basic some-token';
      mockReflector.getAllAndOverride.mockReturnValue(['test:claim']);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(new UnauthorizedException('No Bearer token provided'));
    });

    it('should throw UnauthorizedException when authorization header is malformed', async () => {
      mockRequest.headers.authorization = 'Bearer';
      mockReflector.getAllAndOverride.mockReturnValue(['test:claim']);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(new UnauthorizedException('No Bearer token provided'));
    });

    it('should throw UnauthorizedException when authorization header has too many parts', async () => {
      mockRequest.headers.authorization = 'Bearer token1 token2 token3';
      mockReflector.getAllAndOverride.mockReturnValue(['test:claim']);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(new UnauthorizedException('Malformed authorization header'));
    });
  });

  describe('canActivate - Claims Validation', () => {
    beforeEach(() => {
      mockRequest.headers.authorization = 'Bearer valid-token';
    });

    it('should throw UnauthorizedException when no required claims specified', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(null);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(new UnauthorizedException('No required claims specified'));
    });

    it('should throw UnauthorizedException when empty claims array', async () => {
      mockReflector.getAllAndOverride.mockReturnValue([]);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(new UnauthorizedException('No required claims specified'));
    });

    it('should call reflector.getAllAndOverride with correct parameters', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(['test:claim']);
      mockValidateTokenAndClaims.mockReturnValue({ 'test:claim': true });
      mockDecode.mockReturnValue({
        clientId: 'client-123',
        tenantId: 'tenant-456',
        claims: ['test:claim'],
      });

      await guard.canActivate(mockExecutionContext);

      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(CLAIMS_KEY, [
        mockExecutionContext.getHandler(),
        mockExecutionContext.getClass(),
      ]);
    });
  });

  describe('canActivate - Token Validation', () => {
    beforeEach(() => {
      mockRequest.headers.authorization = 'Bearer valid-token';
      mockReflector.getAllAndOverride.mockReturnValue(['test:claim']);
    });

    it('should successfully validate token and claims', async () => {
      mockValidateTokenAndClaims.mockReturnValue({ 'test:claim': true });
      mockDecode.mockReturnValue({
        clientId: 'client-123',
        tenantId: 'tenant-456',
        claims: ['test:claim'],
      });

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(mockValidateTokenAndClaims).toHaveBeenCalledWith('valid-token', ['test:claim']);
    });

    it('should attach authenticated user to request', async () => {
      mockValidateTokenAndClaims.mockReturnValue({ 'test:claim': true });
      const decodedToken = {
        clientId: 'client-123',
        tenantId: 'tenant-456',
        claims: ['test:claim'],
      };
      mockDecode.mockReturnValue(decodedToken);

      await guard.canActivate(mockExecutionContext);

      expect(mockRequest.user).toEqual({
        token: decodedToken,
        validated: { 'test:claim': true },
        validClaims: ['test:claim'],
      });
    });

    it('should handle multiple required claims - all valid', async () => {
      const requiredClaims = ['claim1', 'claim2', 'claim3'];
      mockReflector.getAllAndOverride.mockReturnValue(requiredClaims);
      mockValidateTokenAndClaims.mockReturnValue({
        claim1: true,
        claim2: true,
        claim3: true,
      });
      mockDecode.mockReturnValue({
        clientId: 'client-123',
        tenantId: 'tenant-456',
        claims: requiredClaims,
      });

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(mockRequest.user.validClaims).toEqual(requiredClaims);
    });

    it('should throw UnauthorizedException when some required claims are missing', async () => {
      const requiredClaims = ['claim1', 'claim2', 'claim3'];
      mockReflector.getAllAndOverride.mockReturnValue(requiredClaims);
      mockValidateTokenAndClaims.mockReturnValue({
        claim1: true,
        claim2: false,
        claim3: true,
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(new UnauthorizedException('Missing or invalid claims: claim2'));
    });

    it('should throw UnauthorizedException when all required claims are missing', async () => {
      const requiredClaims = ['claim1', 'claim2'];
      mockReflector.getAllAndOverride.mockReturnValue(requiredClaims);
      mockValidateTokenAndClaims.mockReturnValue({
        claim1: false,
        claim2: false,
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        new UnauthorizedException('Missing or invalid claims: claim1, claim2'),
      );
    });
  });

  describe('extractTokenPayload', () => {
    it('should successfully extract valid token payload', async () => {
      const validPayload = {
        clientId: 'client-123',
        tenantId: 'tenant-456',
        claims: ['test:claim'],
      };

      mockReflector.getAllAndOverride.mockReturnValue(['test:claim']);
      mockValidateTokenAndClaims.mockReturnValue({ 'test:claim': true });
      mockDecode.mockReturnValue(validPayload);

      await guard.canActivate(mockExecutionContext);

      expect(mockDecode).toHaveBeenCalledWith('valid-token');
      expect(mockRequest.user.token).toEqual(validPayload);
    });

    it('should throw UnauthorizedException when token decode fails', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(['test:claim']);
      mockValidateTokenAndClaims.mockReturnValue({ 'test:claim': true });
      mockDecode.mockReturnValue(null);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(new UnauthorizedException('Invalid token format'));
    });

    it('should throw UnauthorizedException when decoded token is not an object', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(['test:claim']);
      mockValidateTokenAndClaims.mockReturnValue({ 'test:claim': true });
      mockDecode.mockReturnValue('invalid-token');

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(new UnauthorizedException('Invalid token format'));
    });

    it('should throw UnauthorizedException when clientId is missing', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(['test:claim']);
      mockValidateTokenAndClaims.mockReturnValue({ 'test:claim': true });
      mockDecode.mockReturnValue({
        tenantId: 'tenant-456',
        claims: ['test:claim'],
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(new UnauthorizedException('Invalid token format'));
    });

    it('should throw UnauthorizedException when tenantId is missing', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(['test:claim']);
      mockValidateTokenAndClaims.mockReturnValue({ 'test:claim': true });
      mockDecode.mockReturnValue({
        clientId: 'client-123',
        claims: ['test:claim'],
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(new UnauthorizedException('Invalid token format'));
    });

    it('should throw UnauthorizedException when claims are missing', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(['test:claim']);
      mockValidateTokenAndClaims.mockReturnValue({ 'test:claim': true });
      mockDecode.mockReturnValue({
        clientId: 'client-123',
        tenantId: 'tenant-456',
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(new UnauthorizedException('Invalid token format'));
    });

    it('should throw UnauthorizedException when claims is not an array', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(['test:claim']);
      mockValidateTokenAndClaims.mockReturnValue({ 'test:claim': true });
      mockDecode.mockReturnValue({
        clientId: 'client-123',
        tenantId: 'tenant-456',
        claims: 'not-an-array',
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(new UnauthorizedException('Invalid token format'));
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      mockRequest.headers.authorization = 'Bearer valid-token';
      mockReflector.getAllAndOverride.mockReturnValue(['test:claim']);
    });

    it('should handle validateTokenAndClaims throwing error', async () => {
      mockValidateTokenAndClaims.mockImplementation(() => {
        throw new Error('Token validation error');
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(new UnauthorizedException('Invalid token format'));
    });

    it('should rethrow UnauthorizedException without wrapping', async () => {
      const originalError = new UnauthorizedException('Original error');
      mockValidateTokenAndClaims.mockImplementation(() => {
        throw originalError;
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(originalError);
    });

    it('should handle decode throwing error', async () => {
      mockValidateTokenAndClaims.mockReturnValue({ 'test:claim': true });
      mockDecode.mockImplementation(() => {
        throw new Error('JWT decode error');
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(new UnauthorizedException('Invalid token format'));
    });
  });

  describe('Integration Tests', () => {
    it('should handle complex authentication flow', async () => {
      const complexClaims = ['admin:read', 'admin:write', 'user:profile'];
      const complexToken = {
        clientId: 'complex-client',
        tenantId: 'complex-tenant',
        claims: complexClaims,
        sub: 'user-123',
        iat: 1640995200,
        exp: 1641081600,
      };

      mockRequest.headers.authorization = 'Bearer complex-jwt-token';
      mockReflector.getAllAndOverride.mockReturnValue(complexClaims);
      mockValidateTokenAndClaims.mockReturnValue({
        'admin:read': true,
        'admin:write': true,
        'user:profile': true,
      });
      mockDecode.mockReturnValue(complexToken);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(mockRequest.user).toEqual({
        token: complexToken,
        validated: {
          'admin:read': true,
          'admin:write': true,
          'user:profile': true,
        },
        validClaims: complexClaims,
      });
    });

    it('should handle partial claim validation failure', async () => {
      const mixedClaims = ['valid:claim', 'invalid:claim', 'another:valid'];
      mockReflector.getAllAndOverride.mockReturnValue(mixedClaims);
      mockValidateTokenAndClaims.mockReturnValue({
        'valid:claim': true,
        'invalid:claim': false,
        'another:valid': true,
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        new UnauthorizedException('Missing or invalid claims: invalid:claim'),
      );
    });

    it('should work with single claim requirement', async () => {
      const singleClaim = ['single:claim'];
      mockReflector.getAllAndOverride.mockReturnValue(singleClaim);
      mockValidateTokenAndClaims.mockReturnValue({ 'single:claim': true });
      mockDecode.mockReturnValue({
        clientId: 'client-123',
        tenantId: 'tenant-456',
        claims: singleClaim,
      });

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(mockRequest.user.validClaims).toEqual(singleClaim);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      mockRequest.headers.authorization = 'Bearer valid-token';
    });

    it('should handle claims with special characters', async () => {
      const specialClaims = ['namespace:action', 'service-name:read', 'app/module:write'];
      mockReflector.getAllAndOverride.mockReturnValue(specialClaims);
      mockValidateTokenAndClaims.mockReturnValue({
        'namespace:action': true,
        'service-name:read': true,
        'app/module:write': true,
      });
      mockDecode.mockReturnValue({
        clientId: 'client-123',
        tenantId: 'tenant-456',
        claims: specialClaims,
      });

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should handle very long tokens', async () => {
      const longToken = 'a'.repeat(10000);
      mockRequest.headers.authorization = `Bearer ${longToken}`;
      mockReflector.getAllAndOverride.mockReturnValue(['test:claim']);
      mockValidateTokenAndClaims.mockReturnValue({ 'test:claim': true });
      mockDecode.mockReturnValue({
        clientId: 'client-123',
        tenantId: 'tenant-456',
        claims: ['test:claim'],
      });

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(mockValidateTokenAndClaims).toHaveBeenCalledWith(longToken, ['test:claim']);
    });

    it('should handle empty string token', async () => {
      mockRequest.headers.authorization = 'Bearer ';
      mockReflector.getAllAndOverride.mockReturnValue(['test:claim']);
      mockValidateTokenAndClaims.mockImplementation(() => {
        throw new Error('Token validation error');
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(new UnauthorizedException('Invalid token format'));
    });

    it('should handle unicode characters in authorization header', async () => {
      mockRequest.headers.authorization = 'Bearer токен-with-unicode-💯';
      mockReflector.getAllAndOverride.mockReturnValue(['test:claim']);
      mockValidateTokenAndClaims.mockReturnValue({ 'test:claim': true });
      mockDecode.mockReturnValue({
        clientId: 'client-123',
        tenantId: 'tenant-456',
        claims: ['test:claim'],
      });

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(mockValidateTokenAndClaims).toHaveBeenCalledWith('токен-with-unicode-💯', ['test:claim']);
    });
  });
});
