import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseService } from './database.service';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { ConfigService } from '@nestjs/config';
import { Pool, type QueryResult } from 'pg';
import { IngestMode, type Enrichment } from '@tazama-lf/tcs-lib';

jest.mock('pg', () => {
  const mockPool = {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
  };
  return {
    Pool: jest.fn(() => mockPool),
  };
});

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-123'),
}));

describe('DatabaseService', () => {
  let service: DatabaseService;
  let mockLoggerService: jest.Mocked<LoggerService>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockPool: jest.Mocked<Pool>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
    mockPool = (service as any).pool;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('constructor', () => {
    it('should initialize with default batch size', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('BATCH_SIZE', 1000);
    });

    it('should create Pool with correct configuration', () => {
      expect(Pool).toHaveBeenCalledWith({
        connectionString: process.env.CONFIGURATION_DATABASE_URL,
        max: 10,
      });
    });
  });

  describe('query', () => {
    it('should execute query without parameters', async () => {
      const mockResult = { rows: [{ id: 1 }], rowCount: 1 } as QueryResult;
      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.query('SELECT * FROM test');

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM test', undefined);
      expect(result).toEqual(mockResult);
    });

    it('should execute query with parameters', async () => {
      const mockResult = { rows: [{ id: 1, name: 'test' }], rowCount: 1 } as QueryResult;
      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.query('SELECT * FROM test WHERE id = $1', [1]);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM test WHERE id = $1', [1]);
      expect(result).toEqual(mockResult);
    });

    it('should handle query errors', async () => {
      (mockPool.query as jest.Mock).mockRejectedValue(new Error('Query failed'));

      await expect(service.query('INVALID SQL')).rejects.toThrow('Query failed');
    });

    it('should return typed results', async () => {
      interface TestRow {
        id: number;
        name: string;
      }
      const mockResult = {
        rows: [{ id: 1, name: 'test' }],
        rowCount: 1,
      } as QueryResult<TestRow>;
      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.query<TestRow>('SELECT * FROM test');

      expect(result.rows[0].id).toBe(1);
      expect(result.rows[0].name).toBe('test');
    });
  });

  describe('tableExist', () => {
    it('should return true when table exists', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({
        rows: [{ exists: true }],
        rowCount: 1,
      } as QueryResult);

      const result = await service.tableExist('test_table');

      expect(result).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringMatching(/SELECT EXISTS/i), ['test_table']);
    });

    it('should return false when table does not exist', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({
        rows: [] as unknown,
        rowCount: 1,
      } as QueryResult);

      const result = await service.tableExist('nonexistent_table');

      expect(result).toBe(false);
    });

    it('should handle empty rows', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({
        rows: [] as unknown,
        rowCount: 0,
      } as QueryResult);

      const result = await service.tableExist('test_table');

      expect(result).toBe(false);
    });

    it('should trim and lowercase table name', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({
        rows: [{ exists: true }],
        rowCount: 1,
      } as QueryResult);

      await service.tableExist('  TEST_TABLE  ');

      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), ['test_table']);
    });
  });

  describe('ensureTable', () => {
    it('should create table if not exists', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);

      await service.ensureTable('test_table');

      expect(mockPool.query).toHaveBeenNthCalledWith(1, expect.stringMatching(/CREATE TABLE IF NOT EXISTS test_table/i), undefined);

      const createQuery = (mockPool.query as jest.Mock).mock.calls[0][0] as string;
      expect(createQuery).toMatch(/jobId TEXT NOT NULL/i);

      expect(mockLoggerService.log).toHaveBeenCalledWith('Table "test_table" created or already exists.');
    });

    it('should handle Error instances', async () => {
      const error = new Error('Table creation failed');
      (mockPool.query as jest.Mock).mockRejectedValue(error);

      await service.ensureTable('test_table');

      expect(mockLoggerService.error).toHaveBeenCalledWith('Error while ensuring table "test_table": Table creation failed');
    });

    it('should handle non-Error exceptions', async () => {
      (mockPool.query as jest.Mock).mockRejectedValue('String error');

      await service.ensureTable('test_table');

      expect(mockLoggerService.error).toHaveBeenCalledWith('Unknown error while ensuring table "test_table": "String error"');
    });

    it('should include all required columns', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);

      await service.ensureTable('test_table');

      const createQuery = (mockPool.query as jest.Mock).mock.calls[0][0] as string;
      expect(createQuery).toMatch(/id UUID PRIMARY KEY/i);
      expect(createQuery).toMatch(/data JSONB NOT NULL/i);
      expect(createQuery).toMatch(/jobId TEXT NOT NULL/i);
      expect(createQuery).toMatch(/created_at TIMESTAMP NOT NULL DEFAULT NOW\(\)/i);
    });
  });

  describe('ensureTableWithMetaData', () => {
    it('should create table with metadata columns', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);

      await service.ensureTableWithMetaData('test_table');

      const createQuery = (mockPool.query as jest.Mock).mock.calls[0][0] as string;
      expect(createQuery).toMatch(/tenant_id TEXT NOT NULL/i);
      expect(createQuery).toMatch(/correlation_id TEXT NOT NULL/i);
      expect(createQuery).toMatch(/endpoint_id TEXT NOT NULL/i);
      expect(createQuery).toMatch(/checksum TEXT NOT NULL/i);
      expect(mockLoggerService.log).toHaveBeenCalledWith('Table "test_table" with metadata created or already exists.');
    });

    it('should handle Error instances', async () => {
      const error = new Error('Metadata table creation failed');
      (mockPool.query as jest.Mock).mockRejectedValue(error);

      await service.ensureTableWithMetaData('test_table');

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'Error while ensuring metadata table "test_table": Metadata table creation failed',
      );
    });

    it('should handle non-Error exceptions', async () => {
      (mockPool.query as jest.Mock).mockRejectedValue({ code: '42P01' });

      await service.ensureTableWithMetaData('test_table');

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Unknown error while ensuring metadata table "test_table"'),
      );
    });
  });

  describe('insertRows', () => {
    it('should insert single row and log pull job history', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const rows = [{ id: '1', name: 'test', value: 100 }];

      await service.insertRows('test_table', rows, 'job-123');

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO test_table/i), ['1', 'test', 100]);
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO pull_job_history/i), ['job-123', 1, 1, null]);
      expect(mockLoggerService.log).toHaveBeenCalledWith('Inserting rows with length 1');
      expect(mockLoggerService.log).toHaveBeenCalledWith('Successfully inserted 1 row(s) into "test_table".');
      expect(mockLoggerService.log).toHaveBeenCalledWith('Inserted pull job history for jobId: job-123');
    });

    it('should insert multiple rows', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const rows = [
        { id: '1', name: 'test1' },
        { id: '2', name: 'test2' },
        { id: '3', name: 'test3' },
      ];

      await service.insertRows('test_table', rows, 'job-123');

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO test_table/i), [
        '1',
        'test1',
        '2',
        'test2',
        '3',
        'test3',
      ]);
      expect(mockLoggerService.log).toHaveBeenCalledWith('Successfully inserted 3 row(s) into "test_table".');
    });

    it('should handle empty rows array', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);

      await service.insertRows('test_table', [], 'job-123');

      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('No data provided for insertion'));
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO pull_job_history/i), [
        'job-123',
        0,
        0,
        expect.stringContaining('No data provided for insertion'),
      ]);
    });

    it('should handle batching for large datasets', async () => {
      mockConfigService.get.mockReturnValue(2); // Set batch size to 2
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DatabaseService,
          { provide: LoggerService, useValue: mockLoggerService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const batchService = module.get<DatabaseService>(DatabaseService);
      const batchPool = (batchService as any).pool;
      (batchPool.query as jest.Mock).mockResolvedValue({} as QueryResult);

      const rows = [
        { id: '1', name: 'test1' },
        { id: '2', name: 'test2' },
        { id: '3', name: 'test3' },
        { id: '4', name: 'test4' },
        { id: '5', name: 'test5' },
      ];

      await batchService.insertRows('test_table', rows, 'job-123');

      const insertCalls = (batchPool.query as jest.Mock).mock.calls.filter((call) =>
        (call[0] as string).includes('INSERT INTO test_table'),
      );
      expect(insertCalls).toHaveLength(3); // 5 rows / 2 batch size = 3 batches
    });

    it('should handle Error instances during insertion', async () => {
      (mockPool.query as jest.Mock).mockRejectedValueOnce(new Error('Insertion failed')).mockResolvedValue({} as QueryResult);
      const rows = [{ id: '1', name: 'test' }];

      await service.insertRows('test_table', rows, 'job-123');

      expect(mockLoggerService.error).toHaveBeenCalledWith('Error inserting rows into table "test_table": Insertion failed');
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO pull_job_history/i), [
        'job-123',
        1,
        0,
        'Insertion failed',
      ]);
    });

    it('should handle non-Error exceptions during insertion', async () => {
      const errorObj = { code: '23505', detail: 'Duplicate key' };
      (mockPool.query as jest.Mock).mockRejectedValueOnce(errorObj).mockResolvedValue({} as QueryResult);
      const rows = [{ id: '1', name: 'test' }];

      await service.insertRows('test_table', rows, 'job-123');

      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Error inserting rows into table "test_table"'));
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringMatching(/INSERT INTO pull_job_history/i),
        expect.arrayContaining(['job-123', 1, 0, expect.any(String)]),
      );
    });

    it('should track processed count correctly across batches', async () => {
      mockConfigService.get.mockReturnValue(2);
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DatabaseService,
          { provide: LoggerService, useValue: mockLoggerService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const batchService = module.get<DatabaseService>(DatabaseService);
      const batchPool = (batchService as any).pool;
      (batchPool.query as jest.Mock).mockResolvedValue({} as QueryResult);

      const rows = [
        { id: '1', name: 'test1' },
        { id: '2', name: 'test2' },
        { id: '3', name: 'test3' },
      ];

      await batchService.insertRows('test_table', rows, 'job-123');

      expect(batchPool.query).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO pull_job_history/i), ['job-123', 3, 3, null]);
    });
  });

  describe('updateTable', () => {
    it('should append data in APPEND mode', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const data = [{ key: 'value1' }, { key: 'value2' }];

      await service.updateTable('test_table', 'job-123', IngestMode.APPEND, data);

      expect(mockPool.query).toHaveBeenNthCalledWith(1, expect.stringMatching(/CREATE TABLE IF NOT EXISTS/i), undefined);

      expect(mockPool.query).toHaveBeenNthCalledWith(2, expect.stringMatching(/INSERT INTO test_table/i), expect.any(Array));

      const deleteCalls = (mockPool.query as jest.Mock).mock.calls.filter((call) => (call[0] as string).includes('DELETE FROM'));
      expect(deleteCalls).toHaveLength(0);
    });

    it('should replace data in REPLACE mode', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const data = [{ key: 'value1' }];

      await service.updateTable('test_table', 'job-123', IngestMode.REPLACE, data);

      expect(mockPool.query).toHaveBeenNthCalledWith(1, expect.stringMatching(/CREATE TABLE IF NOT EXISTS/i), undefined);

      expect(mockPool.query).toHaveBeenNthCalledWith(2, expect.stringMatching(/DELETE FROM test_table/i), undefined);

      expect(mockPool.query).toHaveBeenNthCalledWith(3, expect.stringMatching(/INSERT INTO test_table/i), expect.any(Array));
    });

    it('should handle object data by converting to array', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const data = { item1: { key: 'value1' }, item2: { key: 'value2' } };

      await service.updateTable('test_table', 'job-123', IngestMode.APPEND, data);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO test_table/i), expect.any(Array));
    });

    it('should handle single object data', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const data = { key: 'value' };

      await service.updateTable('test_table', 'job-123', IngestMode.APPEND, data);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO test_table/i), expect.any(Array));
    });

    it('should stringify data as JSON and include jobId', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const data = [{ nested: { key: 'value' } }];

      await service.updateTable('test_table', 'job-123', IngestMode.APPEND, data);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['test-uuid-123', '{"nested":{"key":"value"}}', 'job-123']),
      );
    });

    it('should call ensureTable before inserting', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const data = [{ key: 'value' }];

      await service.updateTable('test_table', 'job-123', IngestMode.APPEND, data);

      const createTableCall = (mockPool.query as jest.Mock).mock.calls.find((call) =>
        (call[0] as string).includes('CREATE TABLE IF NOT EXISTS'),
      );
      expect(createTableCall).toBeDefined();
    });
  });

  describe('updateTableWithMetaData', () => {
    const mockEnrichment: Enrichment[] = [
      {
        tenant_id: 'tenant-123',
        correlation_id: 'corr-123',
        data: { key: 'value' },
        endpoint_id: 'endpoint-123',
        checksum: 'abc123',
      },
    ];

    it('should append data with metadata in APPEND mode', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);

      await service.updateTableWithMetaData('test_table', 'job-123', IngestMode.APPEND, mockEnrichment);

      expect(mockPool.query).toHaveBeenNthCalledWith(1, expect.stringMatching(/CREATE TABLE IF NOT EXISTS/i), undefined);

      expect(mockPool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(/INSERT INTO test_table/i),
        expect.arrayContaining(['test-uuid-123', 'tenant-123', 'corr-123', '{"key":"value"}', 'endpoint-123', 'abc123']),
      );

      const deleteCalls = (mockPool.query as jest.Mock).mock.calls.filter((call) => (call[0] as string).includes('DELETE FROM'));
      expect(deleteCalls).toHaveLength(0);
    });

    it('should replace data with metadata in REPLACE mode', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);

      await service.updateTableWithMetaData('test_table', 'job-123', IngestMode.REPLACE, mockEnrichment);

      expect(mockPool.query).toHaveBeenNthCalledWith(1, expect.stringContaining('CREATE TABLE IF NOT EXISTS test_table'), undefined);

      expect(mockPool.query).toHaveBeenNthCalledWith(2, expect.stringMatching(/DELETE FROM test_table/i), undefined);

      expect(mockPool.query).toHaveBeenNthCalledWith(3, expect.stringMatching(/INSERT INTO test_table/i), expect.any(Array));
    });

    it('should handle multiple enrichment records', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const enrichments: Enrichment[] = [
        {
          tenant_id: 'tenant-1',
          correlation_id: 'corr-1',
          data: { key: 'value1' },
          endpoint_id: 'endpoint-1',
          checksum: 'check1',
        },
        {
          tenant_id: 'tenant-2',
          correlation_id: 'corr-2',
          data: { key: 'value2' },
          endpoint_id: 'endpoint-2',
          checksum: 'check2',
        },
      ];

      await service.updateTableWithMetaData('test_table', 'job-123', IngestMode.APPEND, enrichments);

      expect(mockLoggerService.log).toHaveBeenCalledWith('Successfully inserted 2 row(s) into "test_table".');
    });

    it('should stringify enrichment data as JSON', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const enrichment: Enrichment[] = [
        {
          tenant_id: 'tenant-123',
          correlation_id: 'corr-123',
          data: { nested: { deep: { value: 'test' } } },
          endpoint_id: 'endpoint-123',
          checksum: 'abc123',
        },
      ];

      await service.updateTableWithMetaData('test_table', 'job-123', IngestMode.APPEND, enrichment);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([expect.stringContaining('{"nested":{"deep":{"value":"test"}}}')]),
      );
    });

    it('should handle empty enrichment array', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);

      await service.updateTableWithMetaData('test_table', 'job-123', IngestMode.APPEND, []);

      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('No data provided for insertion'));
    });

    it('should call ensureTableWithMetaData before inserting', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);

      await service.updateTableWithMetaData('test_table', 'job-123', IngestMode.APPEND, mockEnrichment);

      const createTableCall = (mockPool.query as jest.Mock).mock.calls.find((call) => {
        const query = call[0] as string;
        return query.includes('CREATE TABLE IF NOT EXISTS') && query.includes('tenant_id');
      });
      expect(createTableCall).toBeDefined();
    });
  });
});
