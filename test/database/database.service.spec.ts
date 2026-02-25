import { BadRequestException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import type { ConfigurationDB, DatabaseManagerInstance, EnrichmentDB, ManagerConfig } from '@tazama-lf/frms-coe-lib';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { ConfigType, IngestMode } from '@tazama-lf/tcs-lib';
import { DatabaseService } from '../../src/database/database.service';

jest.mock('@tazama-lf/frms-coe-lib', () => ({
  ...jest.requireActual('@tazama-lf/frms-coe-lib'),
  CreateDatabaseManager: jest.fn(),
}));

jest.mock('../../src/apm/apm.decorators', () => ({
  ApmSpan: () => (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
}));

describe('DatabaseService', () => {
  let service: DatabaseService;
  let mockLoggerService: jest.Mocked<LoggerService>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockDbManager: jest.Mocked<DatabaseManagerInstance<ManagerConfig> & ConfigurationDB & EnrichmentDB>;

  const { CreateDatabaseManager } = require('@tazama-lf/frms-coe-lib');

  beforeEach(async () => {
    mockLoggerService = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;

    mockConfigService = {
      get: jest.fn().mockReturnValue(1000),
    } as unknown as jest.Mocked<ConfigService>;

    mockDbManager = {
      getPathPushJob: jest.fn().mockResolvedValue(undefined),
      getDefaultPushJob: jest.fn().mockResolvedValue([]),
      getIdPushJob: jest.fn().mockResolvedValue(undefined),
      ingestData: jest.fn().mockResolvedValue(undefined),
      insertJobHistory: jest.fn().mockResolvedValue(undefined),
      createTable: jest.fn().mockResolvedValue(undefined),
      deleteRows: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DatabaseManagerInstance<ManagerConfig> & ConfigurationDB & EnrichmentDB>;

    CreateDatabaseManager.mockResolvedValue(mockDbManager);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);

    await service.onModuleInit();
  });

  afterEach(() => {
    mockLoggerService.log.mockClear();
    mockLoggerService.error.mockClear();
    mockLoggerService.warn.mockClear();
    mockLoggerService.debug.mockClear();
    mockDbManager.getPathPushJob.mockClear();
    mockDbManager.getDefaultPushJob.mockClear();
    mockDbManager.getIdPushJob.mockClear();
    mockDbManager.ingestData.mockClear();
    mockDbManager.insertJobHistory.mockClear();
    mockDbManager.createTable.mockClear();
    mockDbManager.deleteRows.mockClear();
    CreateDatabaseManager.mockClear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize database manager successfully', async () => {
      expect(CreateDatabaseManager).toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalledWith('Database manager initialized successfully', 'DatabaseService');
    });

    it('should log error if database initialization fails', async () => {
      const mockLogger = {
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      } as unknown as jest.Mocked<LoggerService>;

      CreateDatabaseManager.mockRejectedValueOnce(new Error('Connection failed'));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DatabaseService,
          { provide: LoggerService, useValue: mockLogger },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const newService = module.get<DatabaseService>(DatabaseService);

      await expect(newService.onModuleInit()).rejects.toThrow('Connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to initialize Database manager'), 'DatabaseService');
    });
  });

  describe('getPushJobByPath', () => {
    it('should successfully get push job by path', async () => {
      const mockJob = { id: 'job-123', path: '/test/path' };
      mockDbManager.getPathPushJob.mockResolvedValueOnce(mockJob);

      const result = await service.getPushJobByPath('/test/path', 'tenant-123');

      expect(result).toEqual(mockJob);
      expect(mockDbManager.getPathPushJob).toHaveBeenCalledWith('/test/path', 'tenant-123');
      expect(mockLoggerService.log).toHaveBeenCalled();
    });

    it('should handle connection error', async () => {
      mockDbManager.getPathPushJob.mockRejectedValue(new Error('connection refused'));

      await expect(service.getPushJobByPath('/test/path', 'tenant-123')).rejects.toThrow(InternalServerErrorException);
      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('should handle disk full error', async () => {
      mockDbManager.getPathPushJob.mockRejectedValue(new Error('disk full'));

      await expect(service.getPushJobByPath('/test/path', 'tenant-123')).rejects.toThrow(InternalServerErrorException);
      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('should handle relation does not exist error', async () => {
      mockDbManager.getPathPushJob.mockRejectedValue(new Error('relation "test_table" does not exist'));

      await expect(service.getPushJobByPath('/test/path', 'tenant-123')).rejects.toThrow(BadRequestException);
      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('should handle duplicate key error', async () => {
      mockDbManager.getPathPushJob.mockRejectedValue(new Error('duplicate key value violates constraint'));

      await expect(service.getPushJobByPath('/test/path', 'tenant-123')).rejects.toThrow(ConflictException);
      expect(mockLoggerService.warn).toHaveBeenCalled();
    });

    it('should handle unexpected error', async () => {
      mockDbManager.getPathPushJob.mockRejectedValue(new Error('Some unexpected error'));

      await expect(service.getPushJobByPath('/test/path', 'tenant-123')).rejects.toThrow(InternalServerErrorException);
      expect(mockLoggerService.error).toHaveBeenCalled();
    });
  });

  describe('getDefaultPushJob', () => {
    it('should successfully get default push job', async () => {
      const mockJobs = [{ id: 'job-1' }, { id: 'job-2' }];
      mockDbManager.getDefaultPushJob.mockResolvedValue(mockJobs);

      const result = await service.getDefaultPushJob();

      expect(result).toEqual(mockJobs);
      expect(mockDbManager.getDefaultPushJob).toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      mockDbManager.getDefaultPushJob.mockRejectedValue(new Error('Database error'));

      await expect(service.getDefaultPushJob()).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('getPushJobById', () => {
    it('should successfully get push job by id', async () => {
      const mockJob = { id: 'job-123' };
      mockDbManager.getIdPushJob.mockResolvedValue(mockJob);

      const result = await service.getPushJobById(ConfigType.PULL, 'job-123');

      expect(result).toEqual(mockJob);
      expect(mockDbManager.getIdPushJob).toHaveBeenCalledWith(ConfigType.PULL, 'job-123');
      expect(mockLoggerService.log).toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      mockDbManager.getIdPushJob.mockRejectedValue(new Error('Database error'));

      await expect(service.getPushJobById(ConfigType.PULL, 'job-123')).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw when DbManager is not initialized', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DatabaseService,
          { provide: LoggerService, useValue: mockLoggerService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const testService = module.get<DatabaseService>(DatabaseService);

      await expect(testService.getPushJobById(ConfigType.PULL, 'job-123')).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('getPushJob', () => {
    it('should successfully get push job', async () => {
      const mockJob = { id: 'job-123', path: '/test/path' };
      mockDbManager.getPathPushJob.mockResolvedValue(mockJob);

      const result = await service.getPushJob('/test/path', 'tenant-123');

      expect(result).toEqual(mockJob);
      expect(mockDbManager.getPathPushJob).toHaveBeenCalledWith('/test/path', 'tenant-123');
    });

    it('should handle database errors with details', async () => {
      mockDbManager.getPathPushJob.mockRejectedValue(new Error('Database connection error'));

      await expect(service.getPushJob('/test/path', 'tenant-123')).rejects.toThrow(InternalServerErrorException);
      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('should throw when DbManager is not initialized', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DatabaseService,
          { provide: LoggerService, useValue: mockLoggerService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const testService = module.get<DatabaseService>(DatabaseService);

      await expect(testService.getPushJob('/test/path', 'tenant-123')).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('insertRows', () => {
    const mockRows = [
      { id: '1', data: 'test1', checksum: 'abc', job_id: 'job-1' },
      { id: '2', data: 'test2', checksum: 'def', job_id: 'job-1' },
    ];

    beforeEach(() => {
      mockDbManager.ingestData.mockResolvedValue(undefined);
      mockDbManager.insertJobHistory.mockResolvedValue(undefined);
    });

    it('should successfully insert rows', async () => {
      await service.insertRows('test_table', mockRows, 'job-123', 'tenant-123', ConfigType.PULL);

      expect(mockDbManager.ingestData).toHaveBeenCalled();
      expect(mockDbManager.insertJobHistory).toHaveBeenCalledWith('tenant-123', 'job-123', 2, 2, null, ConfigType.PULL);
      expect(mockLoggerService.log).toHaveBeenCalledWith('Successfully inserted 2 row(s) into "test_table".');
    });

    it('should insert rows in batches when exceeding batch size', async () => {
      const largeRows = Array.from({ length: 2500 }, (_, i) => ({
        id: `${i}`,
        data: `test${i}`,
        checksum: `hash${i}`,
        job_id: 'job-1',
      }));

      await service.insertRows('test_table', largeRows, 'job-123', 'tenant-123', ConfigType.PULL);

      expect(mockDbManager.ingestData).toHaveBeenCalledTimes(3);
      expect(mockDbManager.insertJobHistory).toHaveBeenCalledWith('tenant-123', 'job-123', 2500, 2500, null, ConfigType.PULL);
    });

    it('should throw error when no data provided', async () => {
      await expect(service.insertRows('test_table', [], 'job-123', 'tenant-123', ConfigType.PULL)).rejects.toThrow(
        'No data provided for insertion.',
      );
    });

    it('should throw error when no columns found', async () => {
      const emptyRows = [{}];

      await expect(service.insertRows('test_table', emptyRows, 'job-123', 'tenant-123', ConfigType.PULL)).rejects.toThrow(
        'No columns found in the data for insertion.',
      );

      expect(mockDbManager.insertJobHistory).toHaveBeenCalledWith(
        'tenant-123',
        'job-123',
        1,
        0,
        'No columns found in the data for insertion.',
        ConfigType.PULL,
      );
    });

    it('should handle insertion error and record in job history', async () => {
      mockDbManager.ingestData.mockRejectedValue(new Error('Insert failed'));

      await expect(service.insertRows('test_table', mockRows, 'job-123', 'tenant-123', ConfigType.PULL)).rejects.toThrow('Insert failed');

      expect(mockDbManager.insertJobHistory).toHaveBeenCalledWith('tenant-123', 'job-123', 2, 0, 'Insert failed', ConfigType.PULL);
      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Error inserting rows into table "test_table"'));
    });

    it('should throw when DbManager is not initialized', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DatabaseService,
          { provide: LoggerService, useValue: mockLoggerService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const testService = module.get<DatabaseService>(DatabaseService);

      await expect(testService.insertRows('test_table', mockRows, 'job-123', 'tenant-123', ConfigType.PULL)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('insertPullJobHistory', () => {
    it('should handle database errors', async () => {
      mockDbManager.insertJobHistory.mockRejectedValue(new Error('Database error'));

      await expect(service.insertPullJobHistory('job-123', 100, 95, null, 'tenant-123', ConfigType.PULL)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('ensureTable', () => {
    it('should create table successfully', async () => {
      await service.ensureTable('test_table');

      expect(mockDbManager.createTable).toHaveBeenCalledWith('"test_table"');
      expect(mockLoggerService.log).toHaveBeenCalled();
    });

    it('should handle table names with special characters', async () => {
      await service.ensureTable('test_table_123');

      expect(mockDbManager.createTable).toHaveBeenCalledWith('"test_table_123"');
    });

    it('should throw error for invalid table name', async () => {
      await expect(service.ensureTable('123invalid')).rejects.toThrow('Invalid table name: 123invalid');
    });

    it('should throw error for table name with invalid characters', async () => {
      await expect(service.ensureTable('test-table')).rejects.toThrow('Invalid table name: test-table');
    });

    it('should throw error for table name with spaces', async () => {
      await expect(service.ensureTable('test table')).rejects.toThrow('Invalid table name: test table');
    });

    it('should handle database error during table creation', async () => {
      mockDbManager.createTable.mockRejectedValue(new Error('Table creation failed'));

      await expect(service.ensureTable('test_table')).rejects.toThrow('Table creation failed');
      expect(mockLoggerService.error).toHaveBeenCalledWith('Error while ensuring table "test_table": Table creation failed');
    });

    it('should handle non-Error exceptions during table creation', async () => {
      mockDbManager.createTable.mockRejectedValue({ code: 'CUSTOM_ERROR', message: 'Custom table error' });

      await expect(service.ensureTable('test_table')).rejects.toEqual({ code: 'CUSTOM_ERROR', message: 'Custom table error' });
      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Unknown error while ensuring table "test_table"'));
    });

    it('should throw when DbManager is not initialized', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DatabaseService,
          { provide: LoggerService, useValue: mockLoggerService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const testService = module.get<DatabaseService>(DatabaseService);

      await expect(testService.ensureTable('test_table')).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('updateTable', () => {
    const mockData = [
      { key: 'value1', name: 'test1' },
      { key: 'value2', name: 'test2' },
    ];

    it('should update table in REPLACE mode', async () => {
      const testMockDbManager = {
        getPathPushJob: jest.fn().mockResolvedValue(undefined),
        getDefaultPushJob: jest.fn().mockResolvedValue([]),
        getIdPushJob: jest.fn().mockResolvedValue(undefined),
        ingestData: jest.fn().mockResolvedValue(undefined),
        insertJobHistory: jest.fn().mockResolvedValue(undefined),
        createTable: jest.fn().mockResolvedValue(undefined),
        deleteRows: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<DatabaseManagerInstance<ManagerConfig> & ConfigurationDB & EnrichmentDB>;

      CreateDatabaseManager.mockResolvedValueOnce(testMockDbManager);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DatabaseService,
          { provide: LoggerService, useValue: mockLoggerService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const testService = module.get<DatabaseService>(DatabaseService);
      await testService.onModuleInit();

      await testService.updateTable('test_table', 'job-123', IngestMode.REPLACE, mockData, 'tenant-123', ConfigType.PULL);

      expect(testMockDbManager.createTable).toHaveBeenCalledWith('"test_table"');
      expect(testMockDbManager.deleteRows).toHaveBeenCalledWith('test_table');
      expect(testMockDbManager.ingestData).toHaveBeenCalled();
      expect(testMockDbManager.insertJobHistory).toHaveBeenCalled();
    });

    it('should update table in APPEND mode', async () => {
      const testMockDbManager = {
        getPathPushJob: jest.fn().mockResolvedValue(undefined),
        getDefaultPushJob: jest.fn().mockResolvedValue([]),
        getIdPushJob: jest.fn().mockResolvedValue(undefined),
        ingestData: jest.fn().mockResolvedValue(undefined),
        insertJobHistory: jest.fn().mockResolvedValue(undefined),
        createTable: jest.fn().mockResolvedValue(undefined),
        deleteRows: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<DatabaseManagerInstance<ManagerConfig> & ConfigurationDB & EnrichmentDB>;

      CreateDatabaseManager.mockResolvedValueOnce(testMockDbManager);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DatabaseService,
          { provide: LoggerService, useValue: mockLoggerService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const testService = module.get<DatabaseService>(DatabaseService);
      await testService.onModuleInit();

      await testService.updateTable('test_table', 'job-123', IngestMode.APPEND, mockData, 'tenant-123', ConfigType.PULL);

      expect(testMockDbManager.createTable).toHaveBeenCalledWith('"test_table"');
      expect(testMockDbManager.deleteRows).not.toHaveBeenCalled();
      expect(testMockDbManager.ingestData).toHaveBeenCalled();
      expect(testMockDbManager.insertJobHistory).toHaveBeenCalled();
    });

    it('should update table in APPEND mode', async () => {
      const testMockDbManager = {
        getPathPushJob: jest.fn().mockResolvedValue(undefined),
        getDefaultPushJob: jest.fn().mockResolvedValue([]),
        getIdPushJob: jest.fn().mockResolvedValue(undefined),
        ingestData: jest.fn().mockResolvedValue(undefined),
        insertJobHistory: jest.fn().mockResolvedValue(undefined),
        createTable: jest.fn().mockResolvedValue(undefined),
        deleteRows: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<DatabaseManagerInstance<ManagerConfig> & ConfigurationDB & EnrichmentDB>;

      CreateDatabaseManager.mockResolvedValueOnce(testMockDbManager);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DatabaseService,
          { provide: LoggerService, useValue: mockLoggerService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const testService = module.get<DatabaseService>(DatabaseService);
      await testService.onModuleInit();

      await testService.updateTable('test_table', 'job-123', IngestMode.APPEND, mockData, 'tenant-123', ConfigType.PULL);

      expect(testMockDbManager.createTable).toHaveBeenCalledWith('"test_table"');
      expect(testMockDbManager.deleteRows).not.toHaveBeenCalled();
      expect(testMockDbManager.ingestData).toHaveBeenCalled();
      expect(testMockDbManager.insertJobHistory).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions in updateTable', async () => {
      const testMockDbManager = {
        getPathPushJob: jest.fn().mockResolvedValue(undefined),
        getDefaultPushJob: jest.fn().mockResolvedValue([]),
        getIdPushJob: jest.fn().mockResolvedValue(undefined),
        ingestData: jest.fn().mockResolvedValue(undefined),
        insertJobHistory: jest.fn().mockResolvedValue(undefined),
        createTable: jest.fn().mockResolvedValue(undefined),
        deleteRows: jest.fn().mockRejectedValue({ code: 'CUSTOM_ERROR', message: 'Custom error object' }),
      } as unknown as jest.Mocked<DatabaseManagerInstance<ManagerConfig> & ConfigurationDB & EnrichmentDB>;

      CreateDatabaseManager.mockResolvedValueOnce(testMockDbManager);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DatabaseService,
          { provide: LoggerService, useValue: mockLoggerService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const testService = module.get<DatabaseService>(DatabaseService);
      await testService.onModuleInit();

      await expect(
        testService.updateTable('test_table', 'job-123', IngestMode.REPLACE, mockData, 'tenant-123', ConfigType.PULL),
      ).rejects.toEqual({ code: 'CUSTOM_ERROR', message: 'Custom error object' });

      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Unknown error while updating table "test_table"'));
    });

    it('should throw error when data is null', async () => {
      const testMockDbManager = {
        getPathPushJob: jest.fn().mockResolvedValue(undefined),
        getDefaultPushJob: jest.fn().mockResolvedValue([]),
        getIdPushJob: jest.fn().mockResolvedValue(undefined),
        ingestData: jest.fn().mockResolvedValue(undefined),
        insertJobHistory: jest.fn().mockResolvedValue(undefined),
        createTable: jest.fn().mockResolvedValue(undefined),
        deleteRows: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<DatabaseManagerInstance<ManagerConfig> & ConfigurationDB & EnrichmentDB>;

      CreateDatabaseManager.mockResolvedValueOnce(testMockDbManager);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DatabaseService,
          { provide: LoggerService, useValue: mockLoggerService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const testService = module.get<DatabaseService>(DatabaseService);
      await testService.onModuleInit();

      await expect(
        testService.updateTable('test_table', 'job-123', IngestMode.APPEND, null, 'tenant-123', ConfigType.PULL),
      ).rejects.toThrow('No valid data provided for table update.');
    });

    it('should throw error when data is invalid type', async () => {
      const testMockDbManager = {
        getPathPushJob: jest.fn().mockResolvedValue(undefined),
        getDefaultPushJob: jest.fn().mockResolvedValue([]),
        getIdPushJob: jest.fn().mockResolvedValue(undefined),
        ingestData: jest.fn().mockResolvedValue(undefined),
        insertJobHistory: jest.fn().mockResolvedValue(undefined),
        createTable: jest.fn().mockResolvedValue(undefined),
        deleteRows: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<DatabaseManagerInstance<ManagerConfig> & ConfigurationDB & EnrichmentDB>;

      CreateDatabaseManager.mockResolvedValueOnce(testMockDbManager);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DatabaseService,
          { provide: LoggerService, useValue: mockLoggerService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const testService = module.get<DatabaseService>(DatabaseService);
      await testService.onModuleInit();

      await expect(
        testService.updateTable('test_table', 'job-123', IngestMode.APPEND, 'string-data' as never, 'tenant-123', ConfigType.PULL),
      ).rejects.toThrow('No valid data provided for table update.');
    });

    it('should throw when DbManager is not initialized', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DatabaseService,
          { provide: LoggerService, useValue: mockLoggerService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const testService = module.get<DatabaseService>(DatabaseService);

      await expect(
        testService.updateTable('test_table', 'job-123', IngestMode.APPEND, mockData, 'tenant-123', ConfigType.PULL),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('insertPullJobHistory', () => {
    it('should handle database errors', async () => {
      mockDbManager.insertJobHistory.mockRejectedValue(new Error('Database error'));

      await expect(service.insertPullJobHistory('job-123', 100, 95, null, 'tenant-123', ConfigType.PULL)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should throw when DbManager is not initialized', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DatabaseService,
          { provide: LoggerService, useValue: mockLoggerService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const testService = module.get<DatabaseService>(DatabaseService);

      await expect(testService.insertPullJobHistory('job-123', 100, 95, null, 'tenant-123', ConfigType.PULL)).rejects.toThrow(
        InternalServerErrorException,
      );

      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('insert job history'), 'DatabaseService');
    });
  });
});
