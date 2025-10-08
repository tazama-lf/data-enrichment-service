import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutorService } from '../executor/executor.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import * as cryptoUtils from '../utils/helpers';
import { JobService } from './job.service';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { DatabaseService } from '../database/database.service';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'asd13as-asd13sfgwg-123jbuqr4'),
}));

describe('JobService', () => {
  let service: JobService;
  let fakeKnex: any;
  let jobQueryBuilder: any;
  let scheduleQueryBuilder: any;
  let db: DatabaseService;

  beforeEach(async () => {
    jobQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: 'asd13as-asd13sfgwg-123jbuqr4', name: 'Test Job' }]),
    };

    jest.spyOn(cryptoUtils, 'encrypt').mockImplementation(() => 'hashed_pass');

    scheduleQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ id: 'schedule-123', cron: '* * * * *' }),
    };

    db = {
      tableExist: jest.fn().mockResolvedValue(false),
      ensureTable: jest.fn().mockResolvedValue(true),
    } as any;

    fakeKnex = jest.fn().mockImplementation((tableName: string) => {
      if (tableName === 'job') return jobQueryBuilder;
      if (tableName === 'schedule') return scheduleQueryBuilder;
      throw new Error(`Unexpected table: ${tableName}`);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobService,
        { provide: 'KNEX_CONNECTION', useValue: fakeKnex },
        { provide: DatabaseService, useValue: db },
        { provide: ExecutorService, useValue: { dryRun: jest.fn() } },
        { provide: SchedulerService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('10') } },
        { provide: LoggerService, useValue: { log: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service = module.get<JobService>(JobService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create HTTP Job', async () => {
    const httpPayload = {
      endpoint_name: 'Dummy',
      source_type: 'HTTP',
      description: 'Dummy Pull',
      connection: {
        url: '/v1/enrich/ACM102/customerdata',
        headers: { 'content-type': 'application/json' },
      },
      table_name: 'dummy_http_job_table',
      schedule_id: 'schedule-123',
    };

    jobQueryBuilder.returning.mockResolvedValueOnce([{ id: 'asd13as-asd13sfgwg-123jbuqr4', name: 'Test Job' }]);

    const job = await service.createPull(httpPayload as any);
    expect(db.tableExist).toHaveBeenCalledWith('dummy_http_job_table');
    expect(jobQueryBuilder.insert).toHaveBeenCalledWith({
      ...httpPayload,
      id: 'asd13as-asd13sfgwg-123jbuqr4',
    });
    expect(job).toEqual({ id: 'asd13as-asd13sfgwg-123jbuqr4', name: 'Test Job' });
  });

  it('should hash password for SFTP job payload', async () => {
    const sftpPayload = {
      endpoint_name: 'SecureDummy',
      source_type: 'SFTP',
      description: 'SFTP Pull',
      connection: {
        host: 'sftp.example.com',
        username: 'user1',
        password: 'hashed_pass',
      },
      file: {
        path: 'test.json',
        file_type: 'JSON',
        delimiter: ',',
        encoding: 'utf8',
      },
      table_name: 'dummy_sftp_job_table',
      schedule_id: 'schedule-123',
    };

    const result = await service.createPull(sftpPayload as any);

    expect(db.tableExist).toHaveBeenCalledWith('dummy_sftp_job_table');
    expect(jobQueryBuilder.insert).toHaveBeenCalled();

    const insertedPayload = (jobQueryBuilder.insert as jest.Mock).mock.calls[0][0];

    expect(insertedPayload.connection.password).toEqual('hashed_pass');
    expect(insertedPayload.connection.password).not.toEqual('plain_pass');

    expect(result).toEqual({ id: 'asd13as-asd13sfgwg-123jbuqr4', name: 'Test Job' });
  });

  it('should return a existing job', async () => {
    const httpPayload = {
      endpoint_name: 'Dummy',
      source_type: 'HTTP',
      description: 'Dummy Pull',
      connection: {
        url: '/v1/enrich/ACM102/customerdata',
        headers: { 'content-type': 'application/json' },
      },
      table_name: 'dummy_http_job_table',
      schedule_id: 'schedule-123',
    };

    jobQueryBuilder.returning.mockResolvedValueOnce([{ id: 'asd13as-asd13sfgwg-123jbuqr4', name: 'Inserted Job' }]);

    const newJob = await service.createPull(httpPayload as any);
    expect(newJob).toEqual({
      id: 'asd13as-asd13sfgwg-123jbuqr4',
      name: 'Inserted Job',
    });
    jobQueryBuilder.where.mockReturnThis();
    jobQueryBuilder.first.mockResolvedValueOnce({
      id: 'asd13as-asd13sfgwg-123jbuqr4',
      name: 'Inserted Job',
    });

    const job = await service.findOnePull('asd13as-asd13sfgwg-123jbuqr4');

    expect(jobQueryBuilder.where).toHaveBeenCalledWith({ id: 'asd13as-asd13sfgwg-123jbuqr4' });
    expect(jobQueryBuilder.first).toHaveBeenCalled();
    expect(job).toEqual({ id: 'asd13as-asd13sfgwg-123jbuqr4', name: 'Inserted Job' });
  });

  it('should throw error if job does not exist', async () => {
    jobQueryBuilder.first.mockResolvedValue(null);
    await expect(service.findOnePull('asd13as-asd13sfgwg-123jbuqr4')).rejects.toThrow(NotFoundException);
  });
});
