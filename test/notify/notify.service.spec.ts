import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { StartupFactory } from '@tazama-lf/frms-coe-startup-lib';
import { ConfigType, IngestMode, Job, JobStatus, PushJob, ScheduleStatus, SourceType } from '@tazama-lf/tcs-lib';
import { NotifyService } from '../../src/notify/notify.service';
import { DatabaseService } from '../../src/database/database.service';
import { ExecutorService } from '../../src/executor/executor.service';
import { type QueryResult } from 'pg';

jest.mock('@tazama-lf/frms-coe-startup-lib');

describe('NotifyService', () => {
  let service: NotifyService;
  let mockLoggerService: jest.Mocked<LoggerService>;
  let mockRedisService: jest.Mocked<RedisService>;
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  let mockExecutorService: jest.Mocked<ExecutorService>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockStartupFactory: jest.Mocked<StartupFactory>;

  const mockPushJob: PushJob = {
    id: 'push-123',
    tenant_id: 'tenant-456',
    path: '/api/push-endpoint',
    table_name: 'push_table',
    status: JobStatus.DEPLOYED,
    endpoint_name: 'test-push-endpoint',
    description: 'Test push job',
    version: '1.0.0',
    publishing_status: ScheduleStatus.ACTIVE,
    created_at: new Date(),
    mode: IngestMode.APPEND,
    updated_at: new Date(),
  };

  const mockPullJob: Job = {
    id: 'pull-123',
    tenant_id: 'tenant-456',
    path: null,
    table_name: 'pull_table',
    schedule_id: 'schedule-789',
    source_type: SourceType.HTTP,
    cron: '0 0 * * *',
    iterations: 3,
    connection: {
      url: 'https://api.example.com/data',
      headers: { Authorization: 'Bearer token' },
    },
    mode: IngestMode.APPEND,
    status: JobStatus.DEPLOYED,
    endpoint_name: 'test-pull-endpoint',
    description: 'Test pull job',
    version: '1.0.0',
    publishing_status: ScheduleStatus.ACTIVE,
    created_at: new Date(),
    type: 'pull',
  };

  beforeEach(async () => {
    mockLoggerService = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;

    mockRedisService = {
      setJson: jest.fn().mockResolvedValue(undefined),
      getJson: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<RedisService>;

    mockDatabaseService = {
      getDefaultPushJob: jest.fn(),
      getPushJobById: jest.fn(),
      updateTable: jest.fn().mockResolvedValue(undefined),
      ensureTable: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DatabaseService>;

    mockExecutorService = {
      addCronJob: jest.fn().mockResolvedValue(undefined),
      deleteCronJob: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ExecutorService>;

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        const config: Record<string, unknown> = {
          CACHE_TTL: 86400,
          CONSUMER_STREAM: 'config.notification',
          PRODUCER_STREAM: 'config.notification.response',
        };
        return config[key] ?? defaultValue;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    mockStartupFactory = {
      init: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<StartupFactory>;

    (StartupFactory as jest.MockedClass<typeof StartupFactory>).mockImplementation(() => mockStartupFactory);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotifyService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: ExecutorService, useValue: mockExecutorService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<NotifyService>(NotifyService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('CACHE_TTL', 86400);
      expect(mockConfigService.get).toHaveBeenCalledWith('CONSUMER_STREAM', 'config.notification');
      expect(mockConfigService.get).toHaveBeenCalledWith('PRODUCER_STREAM', 'config.notification.response');
    });
  });

  describe('onModuleInit', () => {
    it('should initialize NATS service and preload cache successfully', async () => {
      const mockPushJobs = [mockPushJob, { ...mockPushJob, id: 'push-456', path: '/api/another-endpoint' }];
      mockDatabaseService.getDefaultPushJob.mockResolvedValue(mockPushJobs as unknown as Record<string, unknown>[]);

      await service.onModuleInit();

      expect(mockStartupFactory.init).toHaveBeenCalledWith(
        expect.any(Function),
        mockLoggerService,
        ['config.notification'],
        'config.notification.response',
      );
      expect(mockLoggerService.log).toHaveBeenCalledWith('NATS consumer initialized for config.notification');
      expect(mockDatabaseService.getDefaultPushJob).toHaveBeenCalled();
      expect(mockRedisService.setJson).toHaveBeenCalledTimes(2);
      expect(mockRedisService.setJson).toHaveBeenCalledWith('/api/push-endpoint', JSON.stringify(mockPushJob), 86400);
      expect(mockLoggerService.log).toHaveBeenCalledWith('Cache preloaded: 2 configurations');
    });

    it('should handle empty push jobs result', async () => {
      mockDatabaseService.getDefaultPushJob.mockResolvedValue([]);

      await service.onModuleInit();

      expect(mockStartupFactory.init).toHaveBeenCalled();
      expect(mockRedisService.setJson).not.toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalledWith('Cache preloaded: 0 configurations');
    });

    it('should not initialize if already initialized', async () => {
      mockDatabaseService.getDefaultPushJob.mockResolvedValue([mockPushJob] as unknown as Record<string, unknown>[]);

      await service.onModuleInit();
      await service.onModuleInit();

      expect(mockLoggerService.warn).toHaveBeenCalledWith('NATS service already initialized');
      expect(mockStartupFactory.init).toHaveBeenCalledTimes(1);
    });

    it('should handle NATS initialization failure', async () => {
      const error = new Error('NATS connection failed');
      mockStartupFactory.init.mockRejectedValue(error);

      await expect(service.onModuleInit()).rejects.toThrow('NATS connection failed');
      expect(mockLoggerService.error).toHaveBeenCalledWith('Failed to initialize ConfigNotifyService: Error: NATS connection failed');
    });

    it('should handle database query failure', async () => {
      const error = new Error('Database query failed');
      mockDatabaseService.getDefaultPushJob.mockRejectedValue(error);

      await expect(service.onModuleInit()).rejects.toThrow('Database query failed');
      expect(mockLoggerService.error).toHaveBeenCalledWith('Failed to initialize ConfigNotifyService: Error: Database query failed');
    });

    it('should handle non-Error exceptions', async () => {
      mockStartupFactory.init.mockRejectedValue('String error');

      await expect(service.onModuleInit()).rejects.toBe('String error');
      expect(mockLoggerService.error).toHaveBeenCalledWith('Failed to initialize ConfigNotifyService: String error');
    });
  });

  describe('onModuleDestroy', () => {
    it('should log destruction message', () => {
      service.onModuleDestroy();

      expect(mockLoggerService.log).toHaveBeenCalledWith('ConfigNotifyService destroyed');
    });
  });

  describe('handleNatsMessage - PUSH config', () => {
    it('should handle push config update successfully', async () => {
      const handleResponse = jest.fn().mockResolvedValue(undefined);
      const reqObj = {
        dataPayload: JSON.stringify({
          endpointId: 'push-123',
          configType: ConfigType.PUSH,
        }),
      };

      mockDatabaseService.getPushJobById.mockResolvedValue(mockPushJob as unknown as Record<string, unknown>);

      await service.handleNatsMessage(reqObj, handleResponse);

      expect(mockLoggerService.log).toHaveBeenCalledWith(expect.stringContaining('RECEIVING MESSAGE'));
      expect(mockDatabaseService.getPushJobById).toHaveBeenCalledWith(ConfigType.PUSH, 'push-123');
      expect(mockRedisService.setJson).toHaveBeenCalledWith('/api/push-endpoint', JSON.stringify(mockPushJob), 86400);
      expect(mockLoggerService.log).toHaveBeenCalledWith('Updated cache for key: /api/push-endpoint');
      expect(handleResponse).toHaveBeenCalledWith({
        endpointId: 'push-123',
        status: 'ACK',
        timestamp: expect.any(String),
      });
      expect(mockLoggerService.log).toHaveBeenCalledWith('Transaction successfully done: push-123');
    });

    it('should handle push config with null path', async () => {
      const handleResponse = jest.fn().mockResolvedValue(undefined);
      const reqObj = {
        dataPayload: JSON.stringify({
          endpointId: 'push-123',
          configType: ConfigType.PUSH,
        }),
      };

      const pushJobWithNullPath = { ...mockPushJob, path: null };
      mockDatabaseService.getPushJobById.mockResolvedValue(pushJobWithNullPath as unknown as Record<string, unknown>);

      await service.handleNatsMessage(reqObj, handleResponse);

      expect(mockRedisService.setJson).toHaveBeenCalledWith(null, JSON.stringify(pushJobWithNullPath), 86400);
    });
  });

  describe('handleNatsMessage - PULL config', () => {
    it('should handle active pull config by adding cron job', async () => {
      const handleResponse = jest.fn().mockResolvedValue(undefined);
      const reqObj = {
        dataPayload: JSON.stringify({
          endpointId: 'pull-123',
          configType: ConfigType.PULL,
        }),
      };

      mockDatabaseService.getPushJobById.mockResolvedValue(mockPullJob as unknown as Record<string, unknown>);

      await service.handleNatsMessage(reqObj, handleResponse);

      expect(mockDatabaseService.getPushJobById).toHaveBeenCalledWith(ConfigType.PULL, 'pull-123');
      expect(mockExecutorService.addCronJob).toHaveBeenCalledWith(mockPullJob);
      expect(mockExecutorService.deleteCronJob).not.toHaveBeenCalled();
      expect(handleResponse).toHaveBeenCalledWith({
        endpointId: 'pull-123',
        status: 'ACK',
        timestamp: expect.any(String),
      });
    });

    it('should warn and not delete cron job when schedule_id is null', async () => {
      const handleResponse = jest.fn().mockResolvedValue(undefined);
      const reqObj = {
        dataPayload: JSON.stringify({
          endpointId: 'pull-123',
          configType: ConfigType.PULL,
        }),
      };

      const pullJobNoSchedule = {
        ...mockPullJob,
        schedule_id: null,
        publishing_status: ScheduleStatus.INACTIVE,
      };

      mockDatabaseService.getPushJobById.mockResolvedValue(pullJobNoSchedule as unknown as Record<string, unknown>);

      await service.handleNatsMessage(reqObj, handleResponse);

      expect(mockExecutorService.deleteCronJob).not.toHaveBeenCalled();
      expect(mockLoggerService.warn).toHaveBeenCalledWith('Cannot delete cron job: schedule_id missing for job pull-123');
    });

    it('should warn and not delete cron job when schedule_id is null', async () => {
      const handleResponse = jest.fn().mockResolvedValue(undefined);
      const reqObj = {
        dataPayload: JSON.stringify({
          endpointId: 'pull-123',
          configType: ConfigType.PULL,
        }),
      };

      const pullJobNoSchedule = {
        ...mockPullJob,
        schedule_id: null,
        publishing_status: ScheduleStatus.INACTIVE,
      };

      mockDatabaseService.getPushJobById.mockResolvedValue(pullJobNoSchedule as unknown as Record<string, unknown>);

      await service.handleNatsMessage(reqObj, handleResponse);

      expect(mockExecutorService.deleteCronJob).not.toHaveBeenCalled();
      expect(mockLoggerService.warn).toHaveBeenCalledWith('Cannot delete cron job: schedule_id missing for job pull-123');
    });
  });

  describe('handleNatsMessage - Error handling', () => {
    it('should handle database query error', async () => {
      const handleResponse = jest.fn().mockResolvedValue(undefined);
      const reqObj = {
        dataPayload: JSON.stringify({
          endpointId: 'push-123',
          configType: ConfigType.PUSH,
        }),
      };

      const error = new Error('Database connection failed');
      mockDatabaseService.getPushJobById.mockRejectedValue(error);

      await service.handleNatsMessage(reqObj, handleResponse);

      expect(mockLoggerService.error).toHaveBeenCalledWith('Error processing message: Database connection failed');
      expect(handleResponse).toHaveBeenCalledWith({
        endpointId: 'push-123',
        status: 'NACK',
        error: 'Database connection failed',
        timestamp: expect.any(String),
      });
    });

    it('should handle non-Error exceptions', async () => {
      const handleResponse = jest.fn().mockResolvedValue(undefined);
      const reqObj = {
        dataPayload: JSON.stringify({
          endpointId: 'push-123',
          configType: ConfigType.PUSH,
        }),
      };

      mockDatabaseService.getPushJobById.mockRejectedValue('String error');

      await service.handleNatsMessage(reqObj, handleResponse);

      expect(mockLoggerService.error).toHaveBeenCalledWith('Error processing message: String error');
      expect(handleResponse).toHaveBeenCalledWith({
        endpointId: 'push-123',
        status: 'NACK',
        error: 'String error',
        timestamp: expect.any(String),
      });
    });

    it('should handle invalid JSON in dataPayload', async () => {
      const handleResponse = jest.fn().mockResolvedValue(undefined);
      const reqObj = {
        dataPayload: 'invalid json{',
      };

      await service.handleNatsMessage(reqObj, handleResponse);

      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Error processing message:'));
      expect(handleResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'NACK',
          error: expect.any(String),
        }),
      );
    });

    it('should handle redis setJson failure for push config', async () => {
      const handleResponse = jest.fn().mockResolvedValue(undefined);
      const reqObj = {
        dataPayload: JSON.stringify({
          endpointId: 'push-123',
          configType: ConfigType.PUSH,
        }),
      };

      mockDatabaseService.getPushJobById.mockResolvedValue(mockPushJob as unknown as Record<string, unknown>);

      const error = new Error('Redis connection failed');
      mockRedisService.setJson.mockRejectedValue(error);

      await service.handleNatsMessage(reqObj, handleResponse);

      expect(mockLoggerService.error).toHaveBeenCalledWith('Error processing message: Redis connection failed');
      expect(handleResponse).toHaveBeenCalledWith({
        endpointId: 'push-123',
        status: 'NACK',
        error: 'Redis connection failed',
        timestamp: expect.any(String),
      });
    });

    it('should handle executor service failure for pull config', async () => {
      const handleResponse = jest.fn().mockResolvedValue(undefined);
      const reqObj = {
        dataPayload: JSON.stringify({
          endpointId: 'pull-123',
          configType: ConfigType.PULL,
        }),
      };

      mockDatabaseService.getPushJobById.mockResolvedValue(mockPullJob as unknown as Record<string, unknown>);

      const error = new Error('Failed to add cron job');
      mockExecutorService.addCronJob.mockRejectedValue(error);

      await service.handleNatsMessage(reqObj, handleResponse);

      expect(mockLoggerService.error).toHaveBeenCalledWith('Error processing message: Failed to add cron job');
      expect(handleResponse).toHaveBeenCalledWith({
        endpointId: 'pull-123',
        status: 'NACK',
        error: 'Failed to add cron job',
        timestamp: expect.any(String),
      });
    });

    it('should handle missing endpointId in payload', async () => {
      const handleResponse = jest.fn().mockResolvedValue(undefined);
      const reqObj = {
        dataPayload: JSON.stringify({
          configType: ConfigType.PUSH,
        }),
      };

      mockDatabaseService.getPushJobById.mockResolvedValue(undefined);

      await service.handleNatsMessage(reqObj, handleResponse);

      expect(mockLoggerService.warn).toHaveBeenCalledWith('No record found for endpointId: undefined');
      expect(handleResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'NACK',
          error: 'Record not found for endpointId: undefined',
        }),
      );
    });

    it('should handle missing configType in payload', async () => {
      const handleResponse = jest.fn().mockResolvedValue(undefined);
      const reqObj = {
        dataPayload: JSON.stringify({
          endpointId: 'push-123',
        }),
      };

      mockDatabaseService.getPushJobById.mockResolvedValue(undefined);

      await service.handleNatsMessage(reqObj, handleResponse);

      expect(mockLoggerService.warn).toHaveBeenCalledWith('No record found for endpointId: push-123');
      expect(handleResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'NACK',
          error: 'Record not found for endpointId: push-123',
        }),
      );
    });
  });

  describe('Integration scenarios', () => {
    it('should handle rapid successive messages', async () => {
      const handleResponse = jest.fn().mockResolvedValue(undefined);
      const reqObj1 = {
        dataPayload: JSON.stringify({
          endpointId: 'push-123',
          configType: ConfigType.PUSH,
        }),
      };
      const reqObj2 = {
        dataPayload: JSON.stringify({
          endpointId: 'pull-123',
          configType: ConfigType.PULL,
        }),
      };

      mockDatabaseService.getPushJobById
        .mockResolvedValueOnce(mockPushJob as unknown as Record<string, unknown>)
        .mockResolvedValueOnce(mockPullJob as unknown as Record<string, unknown>);

      await Promise.all([service.handleNatsMessage(reqObj1, handleResponse), service.handleNatsMessage(reqObj2, handleResponse)]);

      expect(handleResponse).toHaveBeenCalledTimes(2);
      expect(mockRedisService.setJson).toHaveBeenCalledTimes(1);
      expect(mockExecutorService.addCronJob).toHaveBeenCalledTimes(1);
    });

    it('should handle message after module destruction', async () => {
      const handleResponse = jest.fn().mockResolvedValue(undefined);
      const reqObj = {
        dataPayload: JSON.stringify({
          endpointId: 'push-123',
          configType: ConfigType.PUSH,
        }),
      };

      mockDatabaseService.getPushJobById.mockResolvedValue(mockPushJob as unknown as Record<string, unknown>);

      service.onModuleDestroy();
      await service.handleNatsMessage(reqObj, handleResponse);

      expect(handleResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ACK',
        }),
      );
    });
  });
});
