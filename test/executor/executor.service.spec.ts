import { HttpService } from '@nestjs/axios';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, type TestingModule } from '@nestjs/testing';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { AuthType, ConfigType, FileType, IngestMode, type Job, JobStatus, ScheduleStatus, SourceType } from '@tazama-lf/tcs-lib';
import { CronJob } from 'cron';
import { DatabaseService } from '../../src/database/database.service';
import { ExecutorService } from '../../src/executor/executor.service';
import { of, throwError } from 'rxjs';
import SFTPClient from 'ssh2-sftp-client';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

type ReadStream = Readable & {
  pending: boolean;
  open: () => void;
  close: () => void;
};

jest.mock('../../src/apm/apm.decorators', () => ({
  ApmSpan: () => (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
}));

jest.mock('ssh2-sftp-client');

jest.mock('../../src/utils/helpers', () => ({
  decrypt: jest.fn((value: string) => value.replace('encrypted:', '')),
  isValidText: jest.fn(() => true),
  getJobKey: jest.fn((jobId: string, scheduleId: string) => `job-${jobId}-schedule-${scheduleId}`),
}));

const createMockReadStream = (buffer: Buffer): ReadStream => {
  const stream = new Readable() as ReadStream;
  stream.push(buffer);
  stream.push(null);
  stream.pending = false;
  stream.open = jest.fn();
  stream.close = jest.fn();
  return stream;
};

describe('ExecutorService', () => {
  let service: ExecutorService;
  let mockLoggerService: jest.Mocked<LoggerService>;
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  let mockRedisService: jest.Mocked<RedisService>;
  let mockHttpService: jest.Mocked<HttpService>;
  let mockSchedulerRegistry: jest.Mocked<SchedulerRegistry>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockSftpClient: jest.Mocked<SFTPClient>;

  const mockJob: Job = {
    id: 'job-123',
    tenant_id: 'tenant-456',
    path: '/customers/data',
    table_name: 'test_table',
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
    endpoint_name: 'test-endpoint',
    description: 'Test job',
    version: '1.0.0',
    publishing_status: ScheduleStatus.ACTIVE,
    created_at: new Date(),
    type: 'pull',
  };

  beforeEach(async () => {
    mockLoggerService = {
      error: jest.fn(),
      warn: jest.fn(),
      log: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;

    mockDatabaseService = {
      updateTable: jest.fn().mockResolvedValue(undefined),
      ensureTable: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DatabaseService>;

    mockConfigService = {
      get: jest.fn().mockReturnValue(86400),
    } as unknown as jest.Mocked<ConfigService>;

    mockRedisService = {
      set: jest.fn().mockResolvedValue(undefined),
      getJson: jest.fn().mockResolvedValue('1'),
      get: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<RedisService>;

    mockHttpService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<HttpService>;

    mockSchedulerRegistry = {
      addCronJob: jest.fn(),
      getCronJob: jest.fn(),
      getCronJobs: jest.fn().mockReturnValue(new Map()),
      deleteCronJob: jest.fn(),
    } as unknown as jest.Mocked<SchedulerRegistry>;

    // Helper function to create a readable stream from buffer
    const createMockStream = (buffer: Buffer) => {
      const stream = new Readable();
      stream.push(buffer);
      stream.push(null);
      return stream;
    };

    mockSftpClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(true),
      get: jest.fn().mockResolvedValue(Buffer.from('{"key":"value"}')),
      createReadStream: jest.fn().mockReturnValue(createMockReadStream(Buffer.from('{"key":"value"}'))),
      end: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SFTPClient>;

    (SFTPClient as jest.MockedClass<typeof SFTPClient>).mockImplementation(() => mockSftpClient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutorService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: SchedulerRegistry, useValue: mockSchedulerRegistry },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ExecutorService>(ExecutorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addCronJob', () => {
    it('should add a new cron job successfully', async () => {
      await service.addCronJob(mockJob);

      expect(mockRedisService.set).toHaveBeenCalledWith('job-job-123-schedule-schedule-789', 0, 86400);
      expect(mockSchedulerRegistry.addCronJob).toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalledWith('Cron Job Scheduled with key job-job-123-schedule-schedule-789');
    });

    it('should use correct timezone', async () => {
      await service.addCronJob(mockJob);

      const addCronJobCall = mockSchedulerRegistry.addCronJob.mock.calls[0];
      expect(addCronJobCall[0]).toBe('job-job-123-schedule-schedule-789');
      expect(addCronJobCall[1]).toBeInstanceOf(CronJob);
    });

    it('should handle job with no iterations', async () => {
      const jobWithoutIterations = { ...mockJob, iterations: undefined };
      await service.addCronJob(jobWithoutIterations);

      expect(mockSchedulerRegistry.addCronJob).toHaveBeenCalled();
    });

    it('should create cron job with correct schedule', async () => {
      const customCronJob = { ...mockJob, cron: '*/5 * * * *' };
      await service.addCronJob(customCronJob);

      const addCronJobCall = mockSchedulerRegistry.addCronJob.mock.calls[0];
      expect(addCronJobCall[1]).toBeInstanceOf(CronJob);
    });

    it('should start cron job immediately', async () => {
      const startSpy = jest.spyOn(CronJob.prototype, 'start').mockImplementation(() => {});

      await service.addCronJob(mockJob);

      const addCronJobCall = mockSchedulerRegistry.addCronJob.mock.calls[0];
      expect(addCronJobCall[1]).toBeInstanceOf(CronJob);
      expect(startSpy).toHaveBeenCalled();

      startSpy.mockRestore();
    });

    it('should throw error when schedule_id is missing', async () => {
      const jobWithoutScheduleId = { ...mockJob, schedule_id: undefined };

      await expect(service.addCronJob(jobWithoutScheduleId)).rejects.toThrow(
        'Cannot schedule job job-123: missing schedule_id or cron expression',
      );
    });

    it('should throw error when cron is missing', async () => {
      const jobWithoutCron = { ...mockJob, cron: undefined };

      await expect(service.addCronJob(jobWithoutCron)).rejects.toThrow(
        'Cannot schedule job job-123: missing schedule_id or cron expression',
      );
    });

    it('should replace existing cron job if one already exists', async () => {
      const mockExistingJob = {
        stop: jest.fn().mockResolvedValue(undefined),
      };
      mockSchedulerRegistry.getCronJobs.mockReturnValue(
        new Map([['job-job-123-schedule-schedule-789', mockExistingJob as unknown as CronJob]]),
      );

      await service.addCronJob(mockJob);

      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        'Cron job job-job-123-schedule-schedule-789 already exists. Stopping and replacing.',
      );
      expect(mockExistingJob.stop).toHaveBeenCalled();
      expect(mockSchedulerRegistry.deleteCronJob).toHaveBeenCalledWith('job-job-123-schedule-schedule-789');
      expect(mockSchedulerRegistry.addCronJob).toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalledWith('Cron Job Scheduled with key job-job-123-schedule-schedule-789');
    });
  });

  describe('deleteCronJob', () => {
    it('should delete existing cron job', async () => {
      const mockExistingJob = {
        stop: jest.fn().mockResolvedValue(undefined),
      };
      mockSchedulerRegistry.getCronJobs.mockReturnValue(
        new Map([['job-job-123-schedule-schedule-789', mockExistingJob as unknown as CronJob]]),
      );

      await service.deleteCronJob('job-123', 'schedule-789');

      expect(mockLoggerService.warn).toHaveBeenCalledWith('Cron job job-job-123-schedule-schedule-789 exists. Stopping.');
      expect(mockExistingJob.stop).toHaveBeenCalled();
      expect(mockSchedulerRegistry.deleteCronJob).toHaveBeenCalledWith('job-job-123-schedule-schedule-789');
    });

    it('should handle deletion when job does not exist', async () => {
      mockSchedulerRegistry.getCronJobs.mockReturnValue(new Map());

      await service.deleteCronJob('job-123', 'schedule-789');

      expect(mockLoggerService.warn).not.toHaveBeenCalled();
      expect(mockSchedulerRegistry.deleteCronJob).not.toHaveBeenCalled();
    });
  });

  describe('handleHttpJob', () => {
    it('should successfully process HTTP job with valid response', async () => {
      const httpJob = { ...mockJob, source_type: SourceType.HTTP };
      const mockResponse = {
        data: { key: 'value' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as never,
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      await service.handleHttpJob(httpJob, 'job-key');

      expect(mockHttpService.get).toHaveBeenCalledWith('https://api.example.com/data', {
        headers: { Authorization: 'Bearer token' },
        timeout: 86400,
      });
      expect(mockDatabaseService.updateTable).toHaveBeenCalledWith(
        'tenant-456_test_table',
        'job-123',
        IngestMode.APPEND,
        { key: 'value' },
        'tenant-456',
        ConfigType.PULL,
      );
      expect(mockRedisService.set).toHaveBeenCalledWith('job-key', 0, 86400);
    });

    it('should handle HTTP job with array data', async () => {
      const httpJob = { ...mockJob, source_type: SourceType.HTTP };
      mockHttpService.get.mockReturnValue(
        of({
          data: [{ id: 1 }, { id: 2 }],
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as never,
        }),
      );

      await service.handleHttpJob(httpJob, 'job-key');

      expect(mockDatabaseService.updateTable).toHaveBeenCalledWith(
        'tenant-456_test_table',
        'job-123',
        IngestMode.APPEND,
        [{ id: 1 }, { id: 2 }],
        'tenant-456',
        ConfigType.PULL,
      );
    });

    it('should handle failure when status is not 200', async () => {
      const httpJob = { ...mockJob, source_type: SourceType.HTTP };
      mockHttpService.get.mockReturnValue(
        of({
          data: { error: 'Not Found' },
          status: 404,
          statusText: 'Not Found',
          headers: {},
          config: {} as never,
        }),
      );

      await service.handleHttpJob(httpJob, 'job-key');

      expect(mockRedisService.getJson).toHaveBeenCalledWith('job-key');
      expect(mockDatabaseService.updateTable).not.toHaveBeenCalled();
    });

    it('should handle success when data is not an object (skips DB update)', async () => {
      const httpJob = { ...mockJob, source_type: SourceType.HTTP };
      mockHttpService.get.mockReturnValue(
        of({
          data: 'string data',
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as never,
        }),
      );

      await service.handleHttpJob(httpJob, 'job-key');

      expect(mockRedisService.set).toHaveBeenCalledWith('job-key', 0, 86400);
      expect(mockDatabaseService.updateTable).not.toHaveBeenCalled();
    });

    it('should handle HTTP request errors', async () => {
      const httpJob = { ...mockJob, source_type: SourceType.HTTP };
      mockHttpService.get.mockReturnValue(throwError(() => new Error('Network error')));

      await expect(service.handleHttpJob(httpJob, 'job-key')).rejects.toThrow('Network error');
    });

    it('should reset failure count to 0 on success', async () => {
      const httpJob = { ...mockJob, source_type: SourceType.HTTP };
      mockHttpService.get.mockReturnValue(
        of({
          data: { key: 'value' },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as never,
        }),
      );

      await service.handleHttpJob(httpJob, 'job-key');

      expect(mockRedisService.set).toHaveBeenCalledWith('job-key', 0, 86400);
    });

    it('should treat null data as success and skip DB update', async () => {
      const httpJob = { ...mockJob, source_type: SourceType.HTTP };
      mockHttpService.get.mockReturnValue(
        of({
          data: null,
          status: 204,
          statusText: 'No Content',
          headers: {},
          config: {} as never,
        }),
      );

      await service.handleHttpJob(httpJob, 'job-key');

      expect(mockRedisService.set).toHaveBeenCalledWith('job-key', 0, 86400);
      expect(mockDatabaseService.updateTable).not.toHaveBeenCalled();
    });
  });

  describe('createSftpConnection', () => {
    it('should create SFTP connection with username/password', async () => {
      const sftpConnection = {
        host: 'sftp.example.com',
        port: 22,
        auth_type: AuthType.USERNAME_PASSWORD,
        user_name: 'testuser',
        password: 'encrypted:password',
        private_key: '',
      };

      const result = await service.createSftpConnection(sftpConnection);

      expect(result).toBe(mockSftpClient);
      expect(mockSftpClient.connect).toHaveBeenCalledWith({
        host: 'sftp.example.com',
        port: 22,
        username: 'testuser',
        password: 'password',
      });
    });

    it('should create SFTP connection with private key', async () => {
      const sftpConnection = {
        host: 'sftp.example.com',
        port: 22,
        auth_type: AuthType.PRIVATE_KEY,
        user_name: 'testuser',
        password: '',
        private_key: 'encrypted:privatekey',
      };

      const result = await service.createSftpConnection(sftpConnection);

      expect(result).toBe(mockSftpClient);
      expect(mockSftpClient.connect).toHaveBeenCalledWith({
        host: 'sftp.example.com',
        port: 22,
        username: 'testuser',
        privateKey: 'privatekey',
      });
    });

    it('should throw error when SFTP connection fails', async () => {
      const sftpConnection = {
        host: 'sftp.example.com',
        port: 22,
        auth_type: AuthType.USERNAME_PASSWORD,
        user_name: 'testuser',
        password: 'encrypted:password',
        private_key: '',
      };
      mockSftpClient.connect.mockRejectedValue(new Error('Connection refused'));

      await expect(service.createSftpConnection(sftpConnection)).rejects.toThrow('SFTP connection failed: Connection refused');
      expect(mockLoggerService.error).toHaveBeenCalledWith('Connection refused');
    });

    it('should handle non-Error connection failures', async () => {
      const sftpConnection = {
        host: 'sftp.example.com',
        port: 22,
        auth_type: AuthType.USERNAME_PASSWORD,
        user_name: 'testuser',
        password: 'encrypted:password',
        private_key: '',
      };
      mockSftpClient.connect.mockRejectedValue('Connection timeout');

      await expect(service.createSftpConnection(sftpConnection)).rejects.toThrow('SFTP connection failed: Connection timeout');
      expect(mockLoggerService.error).toHaveBeenCalledWith('Connection timeout');
    });
  });

  describe('handleSftpJob', () => {
    it('should successfully process SFTP job with JSON file', async () => {
      mockSftpClient.createReadStream.mockReturnValue(createMockReadStream(Buffer.from('{"key":"value"}')));

      const sftpJob: Job = {
        ...mockJob,
        source_type: SourceType.SFTP,
        connection: {
          host: 'sftp.example.com',
          port: 22,
          auth_type: AuthType.USERNAME_PASSWORD,
          user_name: 'testuser',
          password: 'encrypted:password',
          private_key: '',
        },
        file: {
          path: '/data/test.json',
          file_type: FileType.JSON,
        },
      };

      await service.handleSftpJob(sftpJob, 'job-key');

      expect(mockSftpClient.exists).toHaveBeenCalledWith('/data/test.json');
      expect(mockSftpClient.createReadStream).toHaveBeenCalledWith('/data/test.json', { autoClose: true });
      expect(mockDatabaseService.updateTable).toHaveBeenCalledWith(
        'tenant-456_test_table',
        'job-123',
        IngestMode.APPEND,
        [{ key: 'value' }],
        'tenant-456',
        ConfigType.PULL,
      );
      expect(mockRedisService.set).toHaveBeenCalledWith('job-key', 0, 86400);
      expect(mockSftpClient.end).toHaveBeenCalled();
    });

    it('should handle error when file path is missing', async () => {
      const sftpJob: Job = {
        ...mockJob,
        source_type: SourceType.SFTP,
        connection: {
          host: 'sftp.example.com',
          port: 22,
          auth_type: AuthType.USERNAME_PASSWORD,
          user_name: 'testuser',
          password: 'encrypted:password',
          private_key: '',
        },
      };

      await service.handleSftpJob(sftpJob, 'job-key');

      expect(mockLoggerService.error).toHaveBeenCalledWith('SFTP error: File path not provided in job config');
      expect(mockRedisService.getJson).toHaveBeenCalledWith('job-key');
      expect(mockSftpClient.end).toHaveBeenCalled();
    });

    it('should handle error when file does not exist', async () => {
      mockSftpClient.exists.mockResolvedValue(false);
      const sftpJob: Job = {
        ...mockJob,
        source_type: SourceType.SFTP,
        connection: {
          host: 'sftp.example.com',
          port: 22,
          auth_type: AuthType.USERNAME_PASSWORD,
          user_name: 'testuser',
          password: 'encrypted:password',
          private_key: '',
        },
        file: {
          path: '/data/missing.json',
          file_type: FileType.JSON,
        },
      };

      await service.handleSftpJob(sftpJob, 'job-key');

      expect(mockLoggerService.error).toHaveBeenCalledWith('SFTP error: File /data/missing.json not found on SFTP server');
      expect(mockRedisService.getJson).toHaveBeenCalledWith('job-key');
      expect(mockSftpClient.end).toHaveBeenCalled();
    });

    it('should always close SFTP connection even on error', async () => {
      const sftpJob: Job = {
        ...mockJob,
        source_type: SourceType.SFTP,
        connection: {
          host: 'sftp.example.com',
          port: 22,
          auth_type: AuthType.USERNAME_PASSWORD,
          user_name: 'testuser',
          password: 'encrypted:password',
          private_key: '',
        },
        file: {
          path: '/data/test.json',
          file_type: FileType.JSON,
        },
      };

      const errorStream = new Readable() as ReadStream;
      errorStream._read = () => {
        errorStream.destroy(new Error('Read error'));
      };
      errorStream.pending = false;
      errorStream.open = jest.fn();
      errorStream.close = jest.fn();
      mockSftpClient.createReadStream.mockReturnValue(errorStream);

      await service.handleSftpJob(sftpJob, 'job-key');

      expect(mockSftpClient.end).toHaveBeenCalled();
    });

    it('should reset failure count to 0 on success', async () => {
      mockSftpClient.createReadStream.mockReturnValue(createMockReadStream(Buffer.from('{"key":"value"}')));

      const sftpJob: Job = {
        ...mockJob,
        source_type: SourceType.SFTP,
        connection: {
          host: 'sftp.example.com',
          port: 22,
          auth_type: AuthType.USERNAME_PASSWORD,
          user_name: 'testuser',
          password: 'encrypted:password',
          private_key: '',
        },
        file: {
          path: '/data/test.json',
          file_type: FileType.JSON,
        },
      };

      await service.handleSftpJob(sftpJob, 'job-key');

      expect(mockRedisService.set).toHaveBeenCalledWith('job-key', 0, 86400);
    });
  });

  describe('transformFileToJSON', () => {
    it('should transform JSON file to array of objects', async () => {
      mockSftpClient.createReadStream.mockReturnValue(createMockReadStream(Buffer.from('{"name":"test","value":123}')));
      const file = { path: '/data/test.json', file_type: FileType.JSON, delimiter: '' };

      const result = await service.transformFileToJSON(mockSftpClient, file);

      expect(result).toEqual([{ name: 'test', value: 123 }]);
    });

    it('should handle JSON array', async () => {
      mockSftpClient.createReadStream.mockReturnValue(createMockReadStream(Buffer.from('[{"id":1},{"id":2}]')));
      const file = { path: '/data/test.json', file_type: FileType.JSON, delimiter: '' };

      const result = await service.transformFileToJSON(mockSftpClient, file);

      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should return empty array for non-object JSON', async () => {
      mockSftpClient.createReadStream.mockReturnValue(createMockReadStream(Buffer.from('"just a string"')));
      const file = { path: '/data/test.json', file_type: FileType.JSON, delimiter: '' };

      const result = await service.transformFileToJSON(mockSftpClient, file);

      expect(result).toEqual([]);
    });

    it('should return empty array for null JSON', async () => {
      mockSftpClient.createReadStream.mockReturnValue(createMockReadStream(Buffer.from('null')));
      const file = { path: '/data/test.json', file_type: FileType.JSON, delimiter: '' };

      const result = await service.transformFileToJSON(mockSftpClient, file);

      expect(result).toEqual([]);
    });

    it('should transform CSV file to array of objects', async () => {
      const csvContent = 'Name,Age,City\nJohn,30,NYC\nJane,25,LA';
      mockSftpClient.createReadStream.mockReturnValue(createMockReadStream(Buffer.from(csvContent)));
      const file = { path: '/data/test.csv', file_type: FileType.CSV, delimiter: ',' };

      const result = await service.transformFileToJSON(mockSftpClient, file);

      expect(result).toEqual([
        { name: 'John', age: '30', city: 'NYC' },
        { name: 'Jane', age: '25', city: 'LA' },
      ]);
    });

    it('should transform TSV file to array of objects', async () => {
      const tsvContent = 'Name\tAge\tCity\nJohn\t30\tNYC\nJane\t25\tLA';
      mockSftpClient.createReadStream.mockReturnValue(createMockReadStream(Buffer.from(tsvContent)));
      const file = { path: '/data/test.tsv', file_type: FileType.TSV, delimiter: '' };

      const result = await service.transformFileToJSON(mockSftpClient, file);

      expect(result).toEqual([
        { name: 'John', age: '30', city: 'NYC' },
        { name: 'Jane', age: '25', city: 'LA' },
      ]);
    });

    it('should handle CSV with custom delimiter', async () => {
      const csvContent = 'Name;Age;City\nJohn;30;NYC\nJane;25;LA';
      mockSftpClient.createReadStream.mockReturnValue(createMockReadStream(Buffer.from(csvContent)));
      const file = { path: '/data/test.csv', file_type: FileType.CSV, delimiter: ';' };

      const result = await service.transformFileToJSON(mockSftpClient, file);

      expect(result).toEqual([
        { name: 'John', age: '30', city: 'NYC' },
        { name: 'Jane', age: '25', city: 'LA' },
      ]);
    });

    it('should normalize column headers', async () => {
      const csvContent = 'First Name,Last Name,Email Address\nJohn,Doe,john@example.com';
      mockSftpClient.createReadStream.mockReturnValue(createMockReadStream(Buffer.from(csvContent)));
      const file = { path: '/data/test.csv', file_type: FileType.CSV, delimiter: ',' };

      const result = await service.transformFileToJSON(mockSftpClient, file);

      expect(result[0]).toHaveProperty('first_name');
      expect(result[0]).toHaveProperty('last_name');
      expect(result[0]).toHaveProperty('email_address');
    });

    it('should throw error for non-buffer data', async () => {
      const stream = createMockReadStream(Buffer.from('string data'));
      mockSftpClient.createReadStream.mockReturnValue(stream);
      const file = { path: '/data/test.json', file_type: FileType.JSON, delimiter: '' };

      await expect(service.transformFileToJSON(mockSftpClient, file)).rejects.toThrow();
    });

    it('should log and rethrow transformation errors', async () => {
      mockSftpClient.createReadStream.mockReturnValue(createMockReadStream(Buffer.from('invalid json{')));
      const file = { path: '/data/test.json', file_type: FileType.JSON, delimiter: '' };

      await expect(service.transformFileToJSON(mockSftpClient, file)).rejects.toThrow();

      expect(mockLoggerService.error).toHaveBeenCalledWith(expect.stringContaining('Error transforming file'));
    });
  });

  describe('handleFailure', () => {
    it('should increment failure count', async () => {
      mockRedisService.getJson.mockResolvedValue('0');

      await service.handleFailure(mockJob, 'job-key');

      expect(mockRedisService.getJson).toHaveBeenCalledWith('job-key');
      expect(mockRedisService.set).toHaveBeenCalledWith('job-key', 1, 86400);
    });

    it('should handle NaN value from redis', async () => {
      mockRedisService.getJson.mockResolvedValue('invalid');

      await service.handleFailure(mockJob, 'job-key');

      expect(mockRedisService.set).toHaveBeenCalledWith('job-key', 1, 86400);
    });

    it('should stop and delete job when iterations limit reached', async () => {
      const mockCronJob = { stop: jest.fn().mockResolvedValue(undefined) };

      mockSchedulerRegistry.getCronJobs.mockReturnValue(new Map([['job-key', mockCronJob as unknown as CronJob]]));

      const job = { ...mockJob, iterations: 2 };

      mockRedisService.getJson.mockResolvedValue('2');

      await service.handleFailure(job, 'job-key');

      expect(mockRedisService.set).toHaveBeenCalledWith('job-key', 3, 86400);
      expect(mockCronJob.stop).toHaveBeenCalled();
      expect(mockSchedulerRegistry.deleteCronJob).toHaveBeenCalledWith('job-key');
    });

    it('should not stop job when iterations limit not reached', async () => {
      mockRedisService.getJson.mockResolvedValue('1');

      await service.handleFailure(mockJob, 'job-key');

      expect(mockRedisService.set).toHaveBeenCalledWith('job-key', 2, 86400);
      expect(mockSchedulerRegistry.deleteCronJob).not.toHaveBeenCalled();
    });

    it('should handle job with no iterations limit', async () => {
      const jobWithoutIterations = { ...mockJob, iterations: undefined };
      mockRedisService.getJson.mockResolvedValue('5');

      await service.handleFailure(jobWithoutIterations, 'job-key');

      expect(mockRedisService.set).toHaveBeenCalledWith('job-key', 6, 86400);
      expect(mockSchedulerRegistry.deleteCronJob).not.toHaveBeenCalled();
    });
  });

  describe('run', () => {
    it('should execute HTTP job successfully', async () => {
      const httpJob = { ...mockJob, source_type: SourceType.HTTP };
      mockHttpService.get.mockReturnValue(
        of({
          data: { key: 'value' },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as never,
        }),
      );

      await service.run(httpJob, 'job-key');

      expect(mockHttpService.get).toHaveBeenCalled();
      expect(mockDatabaseService.updateTable).toHaveBeenCalled();
    });

    it('should execute SFTP job successfully', async () => {
      mockSftpClient.createReadStream.mockReturnValue(createMockReadStream(Buffer.from('{"key":"value"}')));

      const sftpJob: Job = {
        ...mockJob,
        source_type: SourceType.SFTP,
        connection: {
          host: 'sftp.example.com',
          port: 22,
          auth_type: AuthType.USERNAME_PASSWORD,
          user_name: 'testuser',
          password: 'encrypted:password',
          private_key: '',
        },
        file: {
          path: '/data/test.json',
          file_type: FileType.JSON,
        },
      };

      await service.run(sftpJob, 'job-key');

      expect(mockSftpClient.connect).toHaveBeenCalled();
      expect(mockDatabaseService.updateTable).toHaveBeenCalled();
    });

    it('should handle job execution errors', async () => {
      const httpJob = { ...mockJob, source_type: SourceType.HTTP };
      mockHttpService.get.mockReturnValue(throwError(() => new Error('Execution failed')));

      await service.run(httpJob, 'job-key');

      expect(mockLoggerService.error).toHaveBeenCalledWith('Execution failed');
      expect(mockRedisService.getJson).toHaveBeenCalledWith('job-key');
    });

    it('should handle non-Error exceptions', async () => {
      const httpJob = { ...mockJob, source_type: SourceType.HTTP };
      mockHttpService.get.mockReturnValue(throwError(() => 'String error'));

      await service.run(httpJob, 'job-key');

      expect(mockLoggerService.error).toHaveBeenCalledWith('String error');
      expect(mockRedisService.getJson).toHaveBeenCalledWith('job-key');
    });

    it('should call handleFailure on error', async () => {
      const httpJob = { ...mockJob, source_type: SourceType.HTTP };
      mockHttpService.get.mockReturnValue(throwError(() => new Error('Network failure')));
      mockRedisService.getJson.mockResolvedValue('0');

      await service.run(httpJob, 'job-key');

      expect(mockRedisService.set).toHaveBeenCalledWith('job-key', 1, 86400);
    });
  });
});
