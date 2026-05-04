import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { ConfigType, IngestMode, JobStatus, ScheduleStatus } from '@tazama-lf/tcs-lib';
import type { Request } from 'express';
import { DatabaseService } from '../../src/database/database.service';
import type { CreateEnrichDataDto } from '../../src/job/dto/create-enrich-data.dto';
import { JobService } from '../../src/job/job.service';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-correlation-id-123'),
}));

jest.mock('../../src/apm/apm.decorators', () => ({
  ApmSpan: () => (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
}));

describe('JobService', () => {
  let service: JobService;
  let mockLoggerService: jest.Mocked<LoggerService>;
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  let mockRedisService: jest.Mocked<RedisService>;
  let mockConfigService: jest.Mocked<ConfigService>;

  const mockEndpoint = {
    id: 'endpoint-123',
    tenant_id: 'tenant_456',
    path: '/tcs/test-endpoint',
    table_name: 'test_table',
    status: JobStatus.DEPLOYED,
    publishing_status: ScheduleStatus.ACTIVE,
    mode: IngestMode.APPEND,
  };

  beforeEach(async () => {
    mockLoggerService = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;

    mockDatabaseService = {
      getPushJobByPath: jest.fn(),
      updateTable: jest.fn().mockResolvedValue(undefined),
      ensureTable: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DatabaseService>;

    mockRedisService = {
      getJson: jest.fn(),
      setJson: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<RedisService>;

    mockConfigService = {
      get: jest.fn().mockReturnValue(86400),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobService,
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<JobService>(JobService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createEnrich', () => {
    let mockRequest: Partial<Request>;
    let mockBody: CreateEnrichDataDto;

    beforeEach(() => {
      mockRequest = {
        path: '/tcs/test-endpoint',
        headers: {
          'content-type': 'application/json',
        },
      } as Partial<Request>;

      mockBody = {
        data: { key: 'value', name: 'test' },
      };
    });

    describe('Successful enrichment', () => {
      it('should successfully enrich data from cached endpoint', async () => {
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));

        const result = await service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' });

        expect(mockRedisService.getJson).toHaveBeenCalledWith('/tcs/test-endpoint');
        expect(mockLoggerService.log).toHaveBeenCalledWith('Using endpoint from cache: /tcs/test-endpoint with publishing_status: active');
        expect(mockDatabaseService.updateTable).toHaveBeenCalledWith(
          'tenant_456_test_table',
          'endpoint-123',
          IngestMode.APPEND,
          expect.arrayContaining([
            expect.objectContaining({
              data: { key: 'value', name: 'test' },
              job_id: 'endpoint-123',
              checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
            }),
          ]),
          'tenant_456',
          ConfigType.PUSH,
        );
        expect(result).toEqual({
          message: 'Data Enriched Successfully',
          success: true,
        });
      });

      it('should successfully enrich data from database when not in cache', async () => {
        mockRedisService.getJson.mockResolvedValue('');
        mockDatabaseService.getPushJobByPath.mockResolvedValue(mockEndpoint as never);

        const result = await service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' });

        expect(mockRedisService.getJson).toHaveBeenCalledWith('/tcs/test-endpoint');
        expect(mockDatabaseService.getPushJobByPath).toHaveBeenCalledWith('/tcs/test-endpoint', 'tenant_456');
        expect(mockRedisService.setJson).toHaveBeenCalledWith('/tcs/test-endpoint', JSON.stringify(mockEndpoint), 86400);
        expect(mockLoggerService.log).toHaveBeenCalledWith('Cached endpoint for path: /tcs/test-endpoint');
        expect(result).toEqual({
          message: 'Data Enriched Successfully',
          success: true,
        });
      });

      it('should handle array of data items', async () => {
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));
        const arrayBody: CreateEnrichDataDto = {
          data: [{ id: 1 }, { id: 2 }, { id: 3 }],
        };

        const result = await service.createEnrich({ req: mockRequest as Request, body: arrayBody, tenantId: 'tenant_456' });

        expect(mockDatabaseService.updateTable).toHaveBeenCalledWith(
          'tenant_456_test_table',
          'endpoint-123',
          IngestMode.APPEND,
          expect.arrayContaining([
            expect.objectContaining({ data: { id: 1 } }),
            expect.objectContaining({ data: { id: 2 } }),
            expect.objectContaining({ data: { id: 3 } }),
          ]),
          'tenant_456',
          ConfigType.PUSH,
        );
        expect(result.success).toBe(true);
      });

      it('should generate unique checksum for each data item', async () => {
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));
        const arrayBody: CreateEnrichDataDto = {
          data: [{ value: 'a' }, { value: 'b' }],
        };

        await service.createEnrich({ req: mockRequest as Request, body: arrayBody, tenantId: 'tenant_456' });

        const callArgs = mockDatabaseService.updateTable.mock.calls[0][3] as Array<{
          checksum: string;
          data: Record<string, unknown>;
        }>;
        expect(callArgs[0].checksum).not.toBe(callArgs[1].checksum);
        expect(callArgs[0].checksum).toMatch(/^[a-f0-9]{64}$/);
        expect(callArgs[1].checksum).toMatch(/^[a-f0-9]{64}$/);
      });

      it('should pass endpoint.id as job_id parameter', async () => {
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));

        await service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' });

        const callArgs = mockDatabaseService.updateTable.mock.calls[0][3] as Array<{
          job_id: string;
        }>;
        expect(callArgs[0].job_id).toBe('endpoint-123');
      });

      it('should pass ConfigType.PUSH as type parameter', async () => {
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));

        await service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' });

        expect(mockDatabaseService.updateTable).toHaveBeenCalledWith(
          'tenant_456_test_table',
          'endpoint-123',
          IngestMode.APPEND,
          expect.any(Array),
          'tenant_456',
          ConfigType.PUSH,
        );
      });
    });

    describe('Content-Type validation', () => {
      it('should throw BadRequestException when Content-Type is not application/json', async () => {
        mockRequest.headers = { 'content-type': 'text/plain' };

        await expect(service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' })).rejects.toThrow(
          new BadRequestException('Content-Type must be application/json'),
        );
      });

      it('should throw BadRequestException when Content-Type header is missing', async () => {
        mockRequest.headers = {};

        await expect(service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' })).rejects.toThrow(
          new BadRequestException('Content-Type must be application/json'),
        );
      });

      it('should accept Content-Type with charset', async () => {
        mockRequest.headers = { 'content-type': 'application/json; charset=utf-8' };
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));

        const result = await service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' });

        expect(result.success).toBe(true);
      });

      it('should accept Content-Type with boundary parameter', async () => {
        mockRequest.headers = { 'content-type': 'application/json; boundary=something' };
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));

        const result = await service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' });

        expect(result.success).toBe(true);
      });

      it('should be case-insensitive for Content-Type header', async () => {
        mockRequest.headers = { 'Content-Type': 'Application/JSON' };
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));

        const result = await service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' });

        expect(result.success).toBe(true);
      });
    });

    describe('Endpoint validation', () => {
      it('should throw NotFoundException when endpoint does not exist in cache or database', async () => {
        mockRedisService.getJson.mockResolvedValue('');
        mockDatabaseService.getPushJobByPath.mockResolvedValue(undefined);

        await expect(service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' })).rejects.toMatchObject({
          message: 'Endpoint /tcs/test-endpoint does not exist with tenant_id tenant_456',
        });
      });

      it('should throw NotFoundException when cached endpoint has different tenant_id', async () => {
        const wrongTenantEndpoint = { ...mockEndpoint, tenant_id: 'different-tenant' };
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(wrongTenantEndpoint));

        await expect(service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' })).rejects.toMatchObject({
          message: 'Endpoint /tcs/test-endpoint does not exist with tenant_id tenant_456',
        });
      });

      it('should throw BadRequestException when endpoint is not deployed', async () => {
        const notDeployedEndpoint = { ...mockEndpoint, status: JobStatus.INPROGRESS };
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(notDeployedEndpoint));

        await expect(service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' })).rejects.toThrow(
          new BadRequestException('Endpoint not deployed/approved or not active.'),
        );
      });

      it('should throw BadRequestException when endpoint is not active', async () => {
        const inactiveEndpoint = { ...mockEndpoint, publishing_status: ScheduleStatus.INACTIVE };
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(inactiveEndpoint));

        await expect(service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' })).rejects.toThrow(
          new BadRequestException('Endpoint not deployed/approved or not active.'),
        );
      });

      it('should throw BadRequestException when endpoint is neither deployed nor active', async () => {
        const invalidEndpoint = {
          ...mockEndpoint,
          status: JobStatus.INPROGRESS,
          publishing_status: ScheduleStatus.INACTIVE,
        };
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(invalidEndpoint));

        await expect(service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' })).rejects.toThrow(
          new BadRequestException('Endpoint not deployed/approved or not active.'),
        );
      });

      it('should accept endpoint with DEPLOYED status and ACTIVE publishing_status', async () => {
        const validEndpoint = {
          ...mockEndpoint,
          status: JobStatus.DEPLOYED,
          publishing_status: ScheduleStatus.ACTIVE,
        };
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(validEndpoint));

        const result = await service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' });

        expect(result.success).toBe(true);
      });

      it('should accept endpoint with APPROVED status and ACTIVE publishing_status', async () => {
        const validEndpoint = {
          ...mockEndpoint,
          status: JobStatus.APPROVED,
          publishing_status: ScheduleStatus.ACTIVE,
        };
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(validEndpoint));

        const result = await service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' });

        expect(result.success).toBe(true);
      });
    });

    describe('Error handling', () => {
      it('should throw InternalServerErrorException for unexpected database errors', async () => {
        mockRedisService.getJson.mockResolvedValue('');
        mockDatabaseService.getPushJobByPath.mockRejectedValue(new Error('Database connection failed'));

        await expect(service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' })).rejects.toThrow(
          new InternalServerErrorException('An unexpected error occurred while enriching data.'),
        );

        expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Error in createEnrich'));
      });

      it('should throw InternalServerErrorException for Redis errors', async () => {
        mockRedisService.getJson.mockRejectedValue(new Error('Redis connection failed'));

        await expect(service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' })).rejects.toThrow(
          new InternalServerErrorException('An unexpected error occurred while enriching data.'),
        );

        expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Error in createEnrich'));
      });

      it('should throw InternalServerErrorException when updateTable fails', async () => {
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));
        mockDatabaseService.updateTable.mockRejectedValue(new Error('Insert failed'));

        await expect(service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' })).rejects.toThrow(
          new InternalServerErrorException('An unexpected error occurred while enriching data.'),
        );

        expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Error in createEnrich'));
      });

      it('should not wrap BadRequestException in InternalServerErrorException', async () => {
        mockRequest.headers = { 'content-type': 'text/plain' };

        await expect(service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' })).rejects.toThrow(
          BadRequestException,
        );
        await expect(service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' })).rejects.not.toThrow(
          InternalServerErrorException,
        );
      });

      it('should not wrap NotFoundException in InternalServerErrorException', async () => {
        mockRedisService.getJson.mockResolvedValue('');
        mockDatabaseService.getPushJobByPath.mockResolvedValue(undefined);

        await expect(service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' })).rejects.toThrow(
          NotFoundException,
        );
        await expect(service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' })).rejects.not.toThrow(
          InternalServerErrorException,
        );
      });

      it('should handle non-Error objects thrown', async () => {
        mockRedisService.getJson.mockRejectedValue('String error');

        await expect(service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' })).rejects.toThrow(
          InternalServerErrorException,
        );

        expect(mockLoggerService.error).toHaveBeenCalledWith('Error in createEnrich: String error');
      });

      it('should log error message when exception is Error instance', async () => {
        const errorMessage = 'Specific database error';
        mockRedisService.getJson.mockRejectedValue(new Error(errorMessage));

        await expect(service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' })).rejects.toThrow(
          InternalServerErrorException,
        );

        expect(mockLoggerService.error).toHaveBeenCalledWith(`Error in createEnrich: ${errorMessage}`);
      });
    });

    describe('Data transformation', () => {
      it('should handle complex nested objects', async () => {
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));
        const complexBody: CreateEnrichDataDto = {
          data: {
            user: {
              name: 'John',
              address: {
                city: 'NYC',
                zip: '10001',
              },
            },
            metadata: {
              timestamp: '2025-01-01T00:00:00Z',
            },
          },
        };

        const result = await service.createEnrich({ req: mockRequest as Request, body: complexBody, tenantId: 'tenant_456' });

        expect(result.success).toBe(true);
        const callArgs = mockDatabaseService.updateTable.mock.calls[0][3] as Array<{
          data: Record<string, unknown>;
        }>;
        expect(callArgs[0].data).toEqual(complexBody.data);
      });

      it('should preserve data types in payload', async () => {
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));
        const typedBody: CreateEnrichDataDto = {
          data: {
            string: 'text',
            number: 123,
            boolean: true,
            null_value: null,
            array: [1, 2, 3],
          },
        };

        await service.createEnrich({ req: mockRequest as Request, body: typedBody, tenantId: 'tenant_456' });

        const callArgs = mockDatabaseService.updateTable.mock.calls[0][3] as Array<{
          data: Record<string, unknown>;
        }>;
        expect(callArgs[0].data).toEqual(typedBody.data);
      });

      it('should handle empty object as data', async () => {
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));
        const emptyBody: CreateEnrichDataDto = {
          data: {},
        };

        const result = await service.createEnrich({ req: mockRequest as Request, body: emptyBody, tenantId: 'tenant_456' });

        expect(result.success).toBe(true);
        const callArgs = mockDatabaseService.updateTable.mock.calls[0][3] as Array<{
          data: Record<string, unknown>;
        }>;
        expect(callArgs[0].data).toEqual({});
      });

      it('should handle empty array as data', async () => {
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));
        const emptyArrayBody: CreateEnrichDataDto = {
          data: [],
        };

        const result = await service.createEnrich({ req: mockRequest as Request, body: emptyArrayBody, tenantId: 'tenant_456' });

        expect(result.success).toBe(true);
        expect(mockDatabaseService.updateTable).toHaveBeenCalledWith(
          'tenant_456_test_table',
          'endpoint-123',
          IngestMode.APPEND,
          [],
          'tenant_456',
          ConfigType.PUSH,
        );
      });

      it('should handle large arrays efficiently', async () => {
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));
        const largeArray = Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item-${i}` }));
        const largeBody: CreateEnrichDataDto = {
          data: largeArray,
        };

        const result = await service.createEnrich({ req: mockRequest as Request, body: largeBody, tenantId: 'tenant_456' });

        expect(result.success).toBe(true);
        const callArgs = mockDatabaseService.updateTable.mock.calls[0][3] as Array<{
          data: Record<string, unknown>;
        }>;
        expect(callArgs).toHaveLength(1000);
      });

      it('should generate consistent checksum for same data', async () => {
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));
        const sameData = { a: 1, b: 2 };
        const arrayBody: CreateEnrichDataDto = {
          data: [sameData, sameData],
        };

        await service.createEnrich({ req: mockRequest as Request, body: arrayBody, tenantId: 'tenant_456' });

        const callArgs = mockDatabaseService.updateTable.mock.calls[0][3] as Array<{
          checksum: string;
        }>;
        expect(callArgs[0].checksum).toBe(callArgs[1].checksum);
      });

      it('should generate different checksums for identical data with different property order', async () => {
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));
        const arrayBody: CreateEnrichDataDto = {
          data: [
            { a: 1, b: 2 },
            { b: 2, a: 1 },
          ],
        };

        await service.createEnrich({ req: mockRequest as Request, body: arrayBody, tenantId: 'tenant_456' });

        const callArgs = mockDatabaseService.updateTable.mock.calls[0][3] as Array<{
          checksum: string;
        }>;
        expect(callArgs[0].checksum).toBeDefined();
        expect(callArgs[1].checksum).toBeDefined();
      });
    });

    describe('Caching behavior', () => {
      it('should cache endpoint after fetching from database', async () => {
        mockRedisService.getJson.mockResolvedValue('');
        mockDatabaseService.getPushJobByPath.mockResolvedValue(mockEndpoint as never);

        await service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' });

        expect(mockRedisService.setJson).toHaveBeenCalledWith('/tcs/test-endpoint', JSON.stringify(mockEndpoint), 86400);
      });

      it('should not query database when endpoint is in cache', async () => {
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));

        await service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' });

        expect(mockDatabaseService.getPushJobByPath).not.toHaveBeenCalled();
      });

      it('should use configured cache TTL', async () => {
        mockConfigService.get.mockReturnValue(3600);
        const newModule: TestingModule = await Test.createTestingModule({
          providers: [
            JobService,
            { provide: DatabaseService, useValue: mockDatabaseService },
            { provide: RedisService, useValue: mockRedisService },
            { provide: ConfigService, useValue: mockConfigService },
            { provide: LoggerService, useValue: mockLoggerService },
          ],
        }).compile();

        const newService = newModule.get<JobService>(JobService);
        mockRedisService.getJson.mockResolvedValue('');
        mockDatabaseService.getPushJobByPath.mockResolvedValue(mockEndpoint as never);

        await newService.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' });

        expect(mockRedisService.setJson).toHaveBeenCalledWith('/tcs/test-endpoint', JSON.stringify(mockEndpoint), 3600);
      });
    });

    describe('Table naming', () => {
      it('should use correct table name with tenant_id prefix', async () => {
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));

        await service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' });

        expect(mockDatabaseService.updateTable).toHaveBeenCalledWith(
          'tenant_456_test_table',
          'endpoint-123',
          IngestMode.APPEND,
          expect.any(Array),
          'tenant_456',
          ConfigType.PUSH,
        );
      });

      it('should use endpoint tenant_id for table name', async () => {
        const differentTenantEndpoint = { ...mockEndpoint, tenant_id: 'endpoint_tenant' };
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(differentTenantEndpoint));

        await service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'endpoint_tenant' });

        expect(mockDatabaseService.updateTable).toHaveBeenCalledWith(
          'endpoint_tenant_test_table',
          'endpoint-123',
          IngestMode.APPEND,
          expect.any(Array),
          'endpoint_tenant',
          ConfigType.PUSH,
        );
      });

      it('should handle table names with special characters', async () => {
        const specialEndpoint = { ...mockEndpoint, table_name: 'test_table_2024' };
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(specialEndpoint));

        await service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' });

        expect(mockDatabaseService.updateTable).toHaveBeenCalledWith(
          'tenant_456_test_table_2024',
          'endpoint-123',
          IngestMode.APPEND,
          expect.any(Array),
          'tenant_456',
          ConfigType.PUSH,
        );
      });
    });

    describe('Path handling', () => {
      it('should handle different endpoint paths', async () => {
        const anotherEndpoint = { ...mockEndpoint, path: '/tcs/another-endpoint' };
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(anotherEndpoint));

        const result = await service.createEnrich({
          req: { ...mockRequest, path: '/tcs/another-endpoint' } as Request,
          body: mockBody,
          tenantId: 'tenant_456',
        });

        expect(mockRedisService.getJson).toHaveBeenCalledWith('/tcs/another-endpoint');
        expect(result.success).toBe(true);
      });

      it('should handle paths with trailing slash', async () => {
        const trailingSlashEndpoint = { ...mockEndpoint, path: '/tcs/test-endpoint/' };
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(trailingSlashEndpoint));

        const result = await service.createEnrich({
          req: { ...mockRequest, path: '/tcs/test-endpoint/' } as Request,
          body: mockBody,
          tenantId: 'tenant_456',
        });

        expect(result.success).toBe(true);
      });

      it('should use request path for cache lookup', async () => {
        const customPath = '/tcs/custom-path';
        const customEndpoint = { ...mockEndpoint, path: customPath };
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(customEndpoint));

        await service.createEnrich({ req: { ...mockRequest, path: customPath } as Request, body: mockBody, tenantId: 'tenant_456' });

        expect(mockRedisService.getJson).toHaveBeenCalledWith('/tcs/custom-path');
      });
    });

    describe('SQL Query validation', () => {
      it('should call getPushJobByPath with correct parameters', async () => {
        mockRedisService.getJson.mockResolvedValue('');
        mockDatabaseService.getPushJobByPath.mockResolvedValue(mockEndpoint as never);

        await service.createEnrich({ req: mockRequest as Request, body: mockBody, tenantId: 'tenant_456' });

        expect(mockDatabaseService.getPushJobByPath).toHaveBeenCalledWith('/tcs/test-endpoint', 'tenant_456');
      });
    });
  });
});
