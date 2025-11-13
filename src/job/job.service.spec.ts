import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { IngestMode, JobStatus, ScheduleStatus } from '@tazama-lf/tcs-lib';
import { Request } from 'express';
import { DatabaseService } from '../database/database.service';
import { CreateEnrichDataDto } from './dto/create-enrich-data.dto';
import { JobService } from './job.service';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-correlation-id-123'),
}));

jest.mock('../apm/apm.decorators', () => ({
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
    mode: IngestMode.APPEND,
    status: JobStatus.DEPLOYED,
    publishing_status: ScheduleStatus.ACTIVE,
  };

  beforeEach(async () => {
    mockLoggerService = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;

    mockDatabaseService = {
      query: jest.fn(),
      updateTableWithMetaData: jest.fn().mockResolvedValue(undefined),
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

        const result = await service.createEnrich(mockRequest as Request, mockBody, 'tenant_456');

        expect(mockRedisService.getJson).toHaveBeenCalledWith('/tcs/test-endpoint');
        expect(mockLoggerService.log).toHaveBeenCalledWith('Using endpoint from cache: /tcs/test-endpoint');
        expect(mockDatabaseService.updateTableWithMetaData).toHaveBeenCalledWith(
          'tenant_456_test_table',
          IngestMode.APPEND,
          expect.arrayContaining([
            expect.objectContaining({
              tenant_id: 'tenant_456',
              correlation_id: 'test-correlation-id-123',
              data: { key: 'value', name: 'test' },
              endpoint_id: 'endpoint-123',
              checksum: expect.any(String),
            }),
          ]),
        );
        expect(result).toEqual({
          message: 'Data Enriched Successfully',
          success: true,
        });
      });

      it('should successfully enrich data from database when not in cache', async () => {
        mockRedisService.getJson.mockResolvedValue(null);
        mockDatabaseService.query.mockResolvedValue({
          rows: [mockEndpoint],
        } as never);

        const result = await service.createEnrich(mockRequest as Request, mockBody, 'tenant_456');

        expect(mockRedisService.getJson).toHaveBeenCalledWith('/tcs/test-endpoint');
        expect(mockDatabaseService.query).toHaveBeenCalledWith(expect.stringMatching(/SELECT\s+\*\s+FROM\s+endpoints/i), [
          '/tcs/test-endpoint',
          'tenant_456',
        ]);
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

        const result = await service.createEnrich(mockRequest as Request, arrayBody, 'tenant_456');

        expect(mockDatabaseService.updateTableWithMetaData).toHaveBeenCalledWith(
          'tenant_456_test_table',
          IngestMode.APPEND,
          expect.arrayContaining([
            expect.objectContaining({ data: { id: 1 } }),
            expect.objectContaining({ data: { id: 2 } }),
            expect.objectContaining({ data: { id: 3 } }),
          ]),
        );
        expect(result.success).toBe(true);
      });

      it('should generate unique checksum for each data item', async () => {
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));
        const arrayBody: CreateEnrichDataDto = {
          data: [{ value: 'a' }, { value: 'b' }],
        };

        await service.createEnrich(mockRequest as Request, arrayBody, 'tenant_456');

        const callArgs = mockDatabaseService.updateTableWithMetaData.mock.calls[0][2] as Array<{
          checksum: string;
          data: Record<string, unknown>;
        }>;
        expect(callArgs[0].checksum).not.toBe(callArgs[1].checksum);
      });

      it('should use correlation_id from uuid', async () => {
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));

        await service.createEnrich(mockRequest as Request, mockBody, 'tenant_456');

        const callArgs = mockDatabaseService.updateTableWithMetaData.mock.calls[0][2] as Array<{
          correlation_id: string;
        }>;
        expect(callArgs[0].correlation_id).toBe('test-correlation-id-123');
      });
    });

    describe('Content-Type validation', () => {
      it('should throw BadRequestException when Content-Type is not application/json', async () => {
        mockRequest.headers = { 'content-type': 'text/plain' };

        await expect(service.createEnrich(mockRequest as Request, mockBody, 'tenant_456')).rejects.toThrow(
          new BadRequestException('Content-Type must be application/json'),
        );
      });

      it('should throw BadRequestException when Content-Type header is missing', async () => {
        mockRequest.headers = {};

        await expect(service.createEnrich(mockRequest as Request, mockBody, 'tenant_456')).rejects.toThrow(
          new BadRequestException('Content-Type must be application/json'),
        );
      });

      it('should accept Content-Type with charset', async () => {
        mockRequest.headers = { 'content-type': 'application/json; charset=utf-8' };
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));

        const result = await service.createEnrich(mockRequest as Request, mockBody, 'tenant_456');

        expect(result.success).toBe(true);
      });
    });

    describe('Endpoint validation', () => {
      it('should throw NotFoundException when endpoint does not exist in cache or database', async () => {
        mockRedisService.getJson.mockResolvedValue(null);
        mockDatabaseService.query.mockResolvedValue({ rows: [] } as never);

        await expect(service.createEnrich(mockRequest as Request, mockBody, 'tenant_456')).rejects.toMatchObject({
          message: 'Endpoint /tcs/test-endpoint does not exist with tenant_id tenant_456',
        });
      });

      it('should throw NotFoundException when cached endpoint has different tenant_id', async () => {
        const wrongTenantEndpoint = { ...mockEndpoint, tenant_id: 'different-tenant' };
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(wrongTenantEndpoint));

        await expect(service.createEnrich(mockRequest as Request, mockBody, 'tenant_456')).rejects.toMatchObject({
          message: 'Endpoint /tcs/test-endpoint does not exist with tenant_id tenant_456',
        });
      });

      it('should throw BadRequestException when endpoint is not deployed', async () => {
        const notDeployedEndpoint = { ...mockEndpoint, status: JobStatus.INPROGRESS };
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(notDeployedEndpoint));

        await expect(service.createEnrich(mockRequest as Request, mockBody, 'tenant_456')).rejects.toThrow(
          new BadRequestException('Endpoint not deployed or not active.'),
        );
      });

      it('should throw BadRequestException when endpoint is not active', async () => {
        const inactiveEndpoint = { ...mockEndpoint, publishing_status: ScheduleStatus.INACTIVE };
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(inactiveEndpoint));

        await expect(service.createEnrich(mockRequest as Request, mockBody, 'tenant_456')).rejects.toThrow(
          new BadRequestException('Endpoint not deployed or not active.'),
        );
      });

      it('should throw BadRequestException when endpoint is neither deployed nor active', async () => {
        const invalidEndpoint = {
          ...mockEndpoint,
          status: JobStatus.INPROGRESS,
          publishing_status: ScheduleStatus.INACTIVE,
        };
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(invalidEndpoint));

        await expect(service.createEnrich(mockRequest as Request, mockBody, 'tenant_456')).rejects.toThrow(
          new BadRequestException('Endpoint not deployed or not active.'),
        );
      });
    });

    describe('Error handling', () => {
      it('should throw InternalServerErrorException for unexpected database errors', async () => {
        mockRedisService.getJson.mockResolvedValue(null);
        mockDatabaseService.query.mockRejectedValue(new Error('Database connection failed'));

        await expect(service.createEnrich(mockRequest as Request, mockBody, 'tenant_456')).rejects.toThrow(
          new InternalServerErrorException('An unexpected error occurred while enriching data.'),
        );

        expect(mockLoggerService.error).toHaveBeenCalled();
      });

      it('should throw InternalServerErrorException for Redis errors', async () => {
        mockRedisService.getJson.mockRejectedValue(new Error('Redis connection failed'));

        await expect(service.createEnrich(mockRequest as Request, mockBody, 'tenant_456')).rejects.toThrow(
          new InternalServerErrorException('An unexpected error occurred while enriching data.'),
        );

        expect(mockLoggerService.error).toHaveBeenCalled();
      });

      it('should throw InternalServerErrorException when updateTableWithMetaData fails', async () => {
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));
        mockDatabaseService.updateTableWithMetaData.mockRejectedValue(new Error('Insert failed'));

        await expect(service.createEnrich(mockRequest as Request, mockBody, 'tenant_456')).rejects.toThrow(
          new InternalServerErrorException('An unexpected error occurred while enriching data.'),
        );

        expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Error in createEnrich'), expect.any(String));
      });

      it('should not wrap BadRequestException in InternalServerErrorException', async () => {
        mockRequest.headers = { 'content-type': 'text/plain' };

        await expect(service.createEnrich(mockRequest as Request, mockBody, 'tenant_456')).rejects.toThrow(BadRequestException);
        await expect(service.createEnrich(mockRequest as Request, mockBody, 'tenant_456')).rejects.not.toThrow(
          InternalServerErrorException,
        );
      });

      it('should not wrap NotFoundException in InternalServerErrorException', async () => {
        mockRedisService.getJson.mockResolvedValue(null);
        mockDatabaseService.query.mockResolvedValue({ rows: [] } as never);

        await expect(service.createEnrich(mockRequest as Request, mockBody, 'tenant_456')).rejects.toThrow(NotFoundException);
        await expect(service.createEnrich(mockRequest as Request, mockBody, 'tenant_456')).rejects.not.toThrow(
          InternalServerErrorException,
        );
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

        const result = await service.createEnrich(mockRequest as Request, complexBody, 'tenant_456');

        expect(result.success).toBe(true);
        const callArgs = mockDatabaseService.updateTableWithMetaData.mock.calls[0][2] as Array<{
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

        await service.createEnrich(mockRequest as Request, typedBody, 'tenant_456');

        const callArgs = mockDatabaseService.updateTableWithMetaData.mock.calls[0][2] as Array<{
          data: Record<string, unknown>;
        }>;
        expect(callArgs[0].data).toEqual(typedBody.data);
      });
    });

    describe('Caching behavior', () => {
      it('should cache endpoint after fetching from database', async () => {
        mockRedisService.getJson.mockResolvedValue(null);
        mockDatabaseService.query.mockResolvedValue({ rows: [mockEndpoint] } as never);

        await service.createEnrich(mockRequest as Request, mockBody, 'tenant_456');

        expect(mockRedisService.setJson).toHaveBeenCalledWith('/tcs/test-endpoint', JSON.stringify(mockEndpoint), 86400);
      });

      it('should not query database when endpoint is in cache', async () => {
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));

        await service.createEnrich(mockRequest as Request, mockBody, 'tenant_456');

        expect(mockDatabaseService.query).not.toHaveBeenCalled();
      });
    });

    describe('Table naming', () => {
      it('should use correct table name with tenant_id prefix', async () => {
        mockRedisService.getJson.mockResolvedValue(JSON.stringify(mockEndpoint));

        await service.createEnrich(mockRequest as Request, mockBody, 'tenant_456');

        expect(mockDatabaseService.updateTableWithMetaData).toHaveBeenCalledWith(
          'tenant_456_test_table',
          expect.any(String),
          expect.any(Array),
        );
      });
    });
  });
});
