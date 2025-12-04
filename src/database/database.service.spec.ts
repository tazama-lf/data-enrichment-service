import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseService } from './database.service';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { Pool, type QueryResult } from 'pg';
import { ConfigType } from '@tazama-lf/tcs-lib';

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
  let mockPool: jest.Mocked<Pool>;

  beforeEach(async () => {
    mockLoggerService = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [DatabaseService, { provide: LoggerService, useValue: mockLoggerService }],
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

  describe('ensureTable', () => {
    it('should create table if not exists', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);

      await service.ensureTable('test_table');

      expect(mockPool.query).toHaveBeenNthCalledWith(1, expect.stringMatching(/CREATE TABLE IF NOT EXISTS test_table/i), undefined);

      const createQuery = (mockPool.query as jest.Mock).mock.calls[0][0] as string;
      expect(createQuery).toMatch(/job_id TEXT NOT NULL/i);
      expect(createQuery).toMatch(/checksum TEXT NOT NULL/i);

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
      expect(createQuery).toMatch(/job_id TEXT NOT NULL/i);
      expect(createQuery).toMatch(/checksum TEXT NOT NULL/i);
      expect(createQuery).toMatch(/created_at TIMESTAMP NOT NULL DEFAULT NOW\(\)/i);
    });
  });

  describe('insertRows', () => {
    it('should insert rows using stored procedure', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const rows = [{ id: '1', name: 'test', value: 100 }];

      await service.insertRows('test_table', rows, 'job-123', 'tenant-123', ConfigType.PUSH);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringMatching(/CALL rotate_table_with_data/i), [
        'test_table',
        JSON.stringify(rows),
      ]);
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO job_history/i), [
        'tenant-123',
        'job-123',
        1,
        1,
        null,
        ConfigType.PUSH,
      ]);
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

      await service.insertRows('test_table', rows, 'job-123', 'tenant-123', ConfigType.PULL);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringMatching(/CALL rotate_table_with_data/i), [
        'test_table',
        JSON.stringify(rows),
      ]);
      expect(mockLoggerService.log).toHaveBeenCalledWith('Successfully inserted 3 row(s) into "test_table".');
    });

    it('should handle empty rows array', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);

      await service.insertRows('test_table', [], 'job-123', 'tenant-123', ConfigType.PUSH);

      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('No data provided for insertion'));
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO job_history/i), [
        'tenant-123',
        'job-123',
        0,
        0,
        expect.stringContaining('No data provided for insertion'),
        ConfigType.PUSH,
      ]);
    });

    it('should handle empty columns in first row', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const rows = [{}];

      await service.insertRows('test_table', rows, 'job-123', 'tenant-123', ConfigType.PUSH);

      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('No columns found in the data for insertion'));
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO job_history/i), [
        'tenant-123',
        'job-123',
        1,
        0,
        expect.stringContaining('No columns found'),
        ConfigType.PUSH,
      ]);
    });

    it('should handle Error instances during insertion', async () => {
      (mockPool.query as jest.Mock).mockRejectedValueOnce(new Error('Insertion failed')).mockResolvedValue({} as QueryResult);
      const rows = [{ id: '1', name: 'test' }];

      await service.insertRows('test_table', rows, 'job-123', 'tenant-123', ConfigType.PUSH);

      expect(mockLoggerService.error).toHaveBeenCalledWith('Error inserting rows into table "test_table": Insertion failed');
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO job_history/i), [
        'tenant-123',
        'job-123',
        1,
        0,
        'Insertion failed',
        ConfigType.PUSH,
      ]);
    });

    it('should handle non-Error exceptions during insertion', async () => {
      const errorObj = { code: '23505', detail: 'Duplicate key' };
      (mockPool.query as jest.Mock).mockRejectedValueOnce(errorObj).mockResolvedValue({} as QueryResult);
      const rows = [{ id: '1', name: 'test' }];

      await service.insertRows('test_table', rows, 'job-123', 'tenant-123', ConfigType.PULL);

      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Error inserting rows into table "test_table"'));
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringMatching(/INSERT INTO job_history/i),
        expect.arrayContaining(['tenant-123', 'job-123', 1, 0, expect.any(String), ConfigType.PULL]),
      );
    });

    it('should use ConfigType.PUSH for push jobs', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const rows = [{ id: '1', name: 'test' }];

      await service.insertRows('test_table', rows, 'job-123', 'tenant-123', ConfigType.PUSH);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringMatching(/INSERT INTO job_history/i),
        expect.arrayContaining([ConfigType.PUSH]),
      );
    });

    it('should use ConfigType.PULL for pull jobs', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const rows = [{ id: '1', name: 'test' }];

      await service.insertRows('test_table', rows, 'job-123', 'tenant-123', ConfigType.PULL);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringMatching(/INSERT INTO job_history/i),
        expect.arrayContaining([ConfigType.PULL]),
      );
    });
  });

  describe('updateTable', () => {
    it('should update table with array data', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const data = [{ key: 'value1' }, { key: 'value2' }];

      await service.updateTable('test_table', 'job-123', data, 'tenant-123', ConfigType.PUSH);

      expect(mockPool.query).toHaveBeenNthCalledWith(1, expect.stringMatching(/CREATE TABLE IF NOT EXISTS/i), undefined);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringMatching(/CALL rotate_table_with_data/i),
        expect.arrayContaining(['test_table', expect.any(String)]),
      );
    });

    it('should handle object data by converting to array', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const data = { item1: { key: 'value1' }, item2: { key: 'value2' } };

      await service.updateTable('test_table', 'job-123', data, 'tenant-123', ConfigType.PUSH);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringMatching(/CALL rotate_table_with_data/i), expect.any(Array));
    });

    it('should handle single object data', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const data = { key: 'value' };

      await service.updateTable('test_table', 'job-123', data, 'tenant-123', ConfigType.PULL);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringMatching(/CALL rotate_table_with_data/i), expect.any(Array));
    });

    it('should stringify data as JSON and include job_id and checksum', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const data = [{ nested: { key: 'value' } }];

      await service.updateTable('test_table', 'job-123', data, 'tenant-123', ConfigType.PUSH);

      const storedProcCall = (mockPool.query as jest.Mock).mock.calls.find((call) =>
        (call[0] as string).includes('rotate_table_with_data'),
      );

      expect(storedProcCall).toBeDefined();
      const jsonData = JSON.parse(storedProcCall[1][1]);
      expect(jsonData[0]).toHaveProperty('id', 'test-uuid-123');
      expect(jsonData[0]).toHaveProperty('data');
      expect(jsonData[0]).toHaveProperty('job_id', 'job-123');
      expect(jsonData[0]).toHaveProperty('checksum');
      expect(jsonData[0].checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should call ensureTable before inserting', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const data = [{ key: 'value' }];

      await service.updateTable('test_table', 'job-123', data, 'tenant-123', ConfigType.PUSH);

      const createTableCall = (mockPool.query as jest.Mock).mock.calls.find((call) =>
        (call[0] as string).includes('CREATE TABLE IF NOT EXISTS'),
      );
      expect(createTableCall).toBeDefined();
    });

    it('should generate consistent checksum for same data', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const data = [{ a: 1 }, { a: 1 }];

      await service.updateTable('test_table', 'job-123', data, 'tenant-123', ConfigType.PUSH);

      const storedProcCall = (mockPool.query as jest.Mock).mock.calls.find((call) =>
        (call[0] as string).includes('rotate_table_with_data'),
      );

      const jsonData = JSON.parse(storedProcCall[1][1]);
      expect(jsonData[0].checksum).toBe(jsonData[1].checksum);
    });

    it('should generate different checksums for different data', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const data = [{ a: 1 }, { a: 2 }];

      await service.updateTable('test_table', 'job-123', data, 'tenant-123', ConfigType.PUSH);

      const storedProcCall = (mockPool.query as jest.Mock).mock.calls.find((call) =>
        (call[0] as string).includes('rotate_table_with_data'),
      );

      const jsonData = JSON.parse(storedProcCall[1][1]);
      expect(jsonData[0].checksum).not.toBe(jsonData[1].checksum);
    });

    it('should pass ConfigType to insertRows', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({} as QueryResult);
      const data = [{ key: 'value' }];

      await service.updateTable('test_table', 'job-123', data, 'tenant-123', ConfigType.PULL);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringMatching(/INSERT INTO job_history/i),
        expect.arrayContaining([ConfigType.PULL]),
      );
    });
  });
});
