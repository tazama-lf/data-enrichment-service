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

  it('should be instantiated correctly', () => {
    expect(service).toBeDefined();
  });

  describe('Database Initialization', () => {
    it('should successfully initialize database manager on module init', async () => {
      expect(CreateDatabaseManager).toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalledWith('Database manager initialized successfully', 'DatabaseService');
    });

    it('should log error and throw when database manager initialization fails', async () => {
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

  describe('Retrieving Push Job by Path', () => {
    it('should return push job when valid path and tenant ID are provided', async () => {
      const mockJob = { id: 'job-123', path: '/test/path' };
      mockDbManager.getPathPushJob.mockResolvedValueOnce(mockJob);

      const result = await service.getPushJobByPath('/test/path', 'tenant-123');

      expect(result).toEqual(mockJob);
      expect(mockDbManager.getPathPushJob).toHaveBeenCalledWith('/test/path', 'tenant-123');
      expect(mockLoggerService.log).toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException when database connection fails', async () => {
      mockDbManager.getPathPushJob.mockRejectedValue(new Error('connection refused'));

      await expect(service.getPushJobByPath('/test/path', 'tenant-123')).rejects.toThrow(InternalServerErrorException);
      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException when disk is full', async () => {
      mockDbManager.getPathPushJob.mockRejectedValue(new Error('disk full'));

      await expect(service.getPushJobByPath('/test/path', 'tenant-123')).rejects.toThrow(InternalServerErrorException);
      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('should throw BadRequestException when database table does not exist', async () => {
      mockDbManager.getPathPushJob.mockRejectedValue(new Error('relation "test_table" does not exist'));

      await expect(service.getPushJobByPath('/test/path', 'tenant-123')).rejects.toThrow(BadRequestException);
      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('should throw ConflictException when duplicate key constraint is violated', async () => {
      mockDbManager.getPathPushJob.mockRejectedValue(new Error('duplicate key value violates constraint'));

      await expect(service.getPushJobByPath('/test/path', 'tenant-123')).rejects.toThrow(ConflictException);
      expect(mockLoggerService.warn).toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException for unexpected database errors', async () => {
      mockDbManager.getPathPushJob.mockRejectedValue(new Error('Some unexpected error'));

      await expect(service.getPushJobByPath('/test/path', 'tenant-123')).rejects.toThrow(InternalServerErrorException);
      expect(mockLoggerService.error).toHaveBeenCalled();
    });
  });

  describe('Retrieving Default Push Job', () => {
    it('should return all default push jobs when called', async () => {
      const mockJobs = [{ id: 'job-1' }, { id: 'job-2' }];
      mockDbManager.getDefaultPushJob.mockResolvedValue(mockJobs);

      const result = await service.getDefaultPushJob();

      expect(result).toEqual(mockJobs);
      expect(mockDbManager.getDefaultPushJob).toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException when database operation fails', async () => {
      mockDbManager.getDefaultPushJob.mockRejectedValue(new Error('Database error'));

      await expect(service.getDefaultPushJob()).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('Retrieving Push Job by ID', () => {
    it('should return push job when valid type and ID are provided', async () => {
      const mockJob = { id: 'job-123' };
      mockDbManager.getIdPushJob.mockResolvedValue(mockJob);

      const result = await service.getJobById(ConfigType.PULL, 'job-123');

      expect(result).toEqual(mockJob);
      expect(mockDbManager.getIdPushJob).toHaveBeenCalledWith(ConfigType.PULL, 'job-123');
      expect(mockLoggerService.log).toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException when database query fails', async () => {
      mockDbManager.getIdPushJob.mockRejectedValue(new Error('Database error'));

      await expect(service.getJobById(ConfigType.PULL, 'job-123')).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException when database manager is not initialized', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DatabaseService,
          { provide: LoggerService, useValue: mockLoggerService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const testService = module.get<DatabaseService>(DatabaseService);

      await expect(testService.getJobById(ConfigType.PULL, 'job-123')).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('Inserting Data Rows', () => {
    const mockRows = [
      { id: '1', data: 'test1', checksum: 'abc', job_id: 'job-1' },
      { id: '2', data: 'test2', checksum: 'def', job_id: 'job-1' },
    ];

    beforeEach(() => {
      mockDbManager.ingestData.mockResolvedValue(undefined);
      mockDbManager.insertJobHistory.mockResolvedValue(undefined);
    });

    it('should insert all rows and record job history when data is valid', async () => {
      await service.insertRows('test_table', mockRows, 'job-123', 'tenant-123', ConfigType.PULL);

      expect(mockDbManager.ingestData).toHaveBeenCalled();
      expect(mockDbManager.insertJobHistory).toHaveBeenCalledWith('tenant-123', 'job-123', 2, 2, null, ConfigType.PULL);
      expect(mockLoggerService.log).toHaveBeenCalledWith('Successfully inserted 2 row(s) into "test_table".');
    });

    it('should process large datasets in batches to optimize performance', async () => {
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

    it('should throw error when attempting to insert empty dataset', async () => {
      await expect(service.insertRows('test_table', [], 'job-123', 'tenant-123', ConfigType.PULL)).rejects.toThrow(
        'No data provided for insertion.',
      );
    });

    it('should throw error and log failure when rows contain no columns', async () => {
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

    it('should capture insertion failures and record them in job history', async () => {
      mockDbManager.ingestData.mockRejectedValue(new Error('Insert failed'));

      await expect(service.insertRows('test_table', mockRows, 'job-123', 'tenant-123', ConfigType.PULL)).rejects.toThrow('Insert failed');

      expect(mockDbManager.insertJobHistory).toHaveBeenCalledWith('tenant-123', 'job-123', 2, 0, 'Insert failed', ConfigType.PULL);
      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Error inserting rows into table "test_table"'));
    });

    it('should reject rows with column names that fail SQL identifier validation', async () => {
      const invalidRows = [
        { 'invalid-name': 'value1', 'another!bad': 'value2' },
        { 'invalid-name': 'value3', 'another!bad': 'value4' },
      ];

      await expect(service.insertRows('test_table', invalidRows, 'job-123', 'tenant-123', ConfigType.PULL)).rejects.toThrow(
        'Invalid column name(s): invalid-name, another!bad',
      );

      expect(mockDbManager.insertJobHistory).toHaveBeenCalledWith(
        'tenant-123',
        'job-123',
        2,
        0,
        'Invalid column name(s): invalid-name, another!bad',
        ConfigType.PULL,
      );
    });

    it('should throw InternalServerErrorException when database manager is not initialized', async () => {
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

  describe('Table Creation and Management', () => {
    it('should create or verify table existence when table name is valid', async () => {
      await service.ensureTable('test_table');

      expect(mockDbManager.createTable).toHaveBeenCalledWith('"test_table"');
      expect(mockLoggerService.log).toHaveBeenCalled();
    });

    it('should safely escape and quote table names containing special characters', async () => {
      await service.ensureTable('test_table_123');

      expect(mockDbManager.createTable).toHaveBeenCalledWith('"test_table_123"');
    });

    it('should reject table names that start with invalid characters', async () => {
      await expect(service.ensureTable('123invalid')).rejects.toThrow('Invalid table name: 123invalid');
    });

    it('should reject table names containing SQL injection attempts', async () => {
      await expect(service.ensureTable('test-table')).rejects.toThrow('Invalid table name: test-table');
    });

    it('should reject table names containing whitespace characters', async () => {
      await expect(service.ensureTable('test table')).rejects.toThrow('Invalid table name: test table');
    });

    it('should log and throw error when table creation fails', async () => {
      mockDbManager.createTable.mockRejectedValue(new Error('Table creation failed'));

      await expect(service.ensureTable('test_table')).rejects.toThrow('Table creation failed');
      expect(mockLoggerService.error).toHaveBeenCalledWith('Error while ensuring table "test_table": Table creation failed');
    });

    it('should handle and log non-standard error objects during table creation', async () => {
      mockDbManager.createTable.mockRejectedValue({ code: 'CUSTOM_ERROR', message: 'Custom table error' });

      await expect(service.ensureTable('test_table')).rejects.toEqual({ code: 'CUSTOM_ERROR', message: 'Custom table error' });
      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Unknown error while ensuring table "test_table"'));
    });

    it('should throw InternalServerErrorException when database manager is not initialized', async () => {
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

  describe('Updating Table Data', () => {
    const mockData = [
      { key: 'value1', name: 'test1' },
      { key: 'value2', name: 'test2' },
    ];

    it('should delete existing rows and insert new data in REPLACE mode', async () => {
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

    it('should preserve existing rows and append new data in APPEND mode', async () => {
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

    it('should handle non-standard error objects during table updates', async () => {
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

    it('should throw InternalServerErrorException when database manager is not initialized', async () => {
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

  describe('Recording Job History', () => {
    it('should throw InternalServerErrorException when job history insertion fails', async () => {
      mockDbManager.insertJobHistory.mockRejectedValue(new Error('Database error'));

      await expect(service.insertPullJobHistory('job-123', 100, 95, null, 'tenant-123', ConfigType.PULL)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should throw InternalServerErrorException when database manager is not initialized', async () => {
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

  describe('Database Connection State Validation', () => {
    it('should prevent operations when database manager is not initialized for getPushJobByPath', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DatabaseService,
          { provide: LoggerService, useValue: mockLoggerService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const testService = module.get<DatabaseService>(DatabaseService);

      await expect(testService.getPushJobByPath('/test/path', 'tenant-123')).rejects.toThrow(InternalServerErrorException);
      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Database manager not initialized'), 'DatabaseService');
    });

    it('should prevent operations when database manager is not initialized for getDefaultPushJob', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DatabaseService,
          { provide: LoggerService, useValue: mockLoggerService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const testService = module.get<DatabaseService>(DatabaseService);

      await expect(testService.getDefaultPushJob()).rejects.toThrow(InternalServerErrorException);
      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Database manager not initialized'), 'DatabaseService');
    });
  });

  describe('Database Constraint Error Handling', () => {
    it('should throw ConflictException when unique constraint is violated', async () => {
      const detailsObject = { key: 'value', nested: { data: 'test' } };
      mockDbManager.getPathPushJob.mockRejectedValue(new Error('unique constraint violation'));

      await expect(service.getPushJobByPath('/test/path', 'tenant-123')).rejects.toThrow(ConflictException);
      expect(mockLoggerService.warn).toHaveBeenCalledWith(expect.stringContaining('Duplicate'), 'DatabaseService');
    });

    it('should throw BadRequestException when foreign key constraint is violated', async () => {
      mockDbManager.getPathPushJob.mockRejectedValue(new Error('foreign key constraint failed'));

      await expect(service.getPushJobByPath('/test/path', 'tenant-123')).rejects.toThrow(BadRequestException);
      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Invalid reference'), 'DatabaseService');
    });

    it('should throw BadRequestException when SQL syntax is invalid', async () => {
      mockDbManager.getPathPushJob.mockRejectedValue(new Error('invalid input syntax for type integer'));

      await expect(service.getPushJobByPath('/test/path', 'tenant-123')).rejects.toThrow(BadRequestException);
      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Invalid data format'), 'DatabaseService');
    });
  });
});
