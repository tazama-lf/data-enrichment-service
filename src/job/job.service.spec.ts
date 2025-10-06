import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutorService } from '../executor/executor.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import * as cryptoUtils from '../utils/helpers';
import { JobService } from './job.service';
import { LoggerService } from '@tazama-lf/frms-coe-lib';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'asd13as-asd13sfgwg-123jbuqr4'),
}));

describe('JobService', () => {
  let service: JobService;
  let fakeKnex: any;
  let queryBuilder: any;
  let fakeSchedulerService: SchedulerService;
  let fakeExecutorService: ExecutorService;

  beforeEach(async () => {
    queryBuilder = {
      orderBy: jest.fn().mockResolvedValue([{ id: 'asd13as-asd13sfgwg-123jbuqr4', name: 'Job 1' }]),
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ id: 'asd13as-asd13sfgwg-123jbuqr4', name: 'Job 1' }),
      insert: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: 'asd13as-asd13sfgwg-123jbuqr4', name: 'Inserted Job' }]),
    };

    jest.spyOn(cryptoUtils, 'encrypt').mockImplementation(() => 'hashed_pass');

    fakeExecutorService = {
      tableExist: jest.fn().mockResolvedValue(false),
      ensureTable: jest.fn().mockResolvedValue(true),
    } as any;

    fakeKnex = jest.fn().mockImplementation(() => queryBuilder);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('10') },
        },
        { provide: LoggerService, useValue: { error: jest.fn(), log: jest.fn() } },
        JobService,
        { provide: ExecutorService, useValue: fakeExecutorService },
        {
          provide: SchedulerService,
          useValue: fakeSchedulerService,
        },
        {
          provide: 'KNEX_CONNECTION',
          useValue: fakeKnex,
        },
      ],
    }).compile();

    service = module.get<JobService>(JobService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create HTTP job', async () => {
    const httpPayload = {
      endpoint_name: 'Dummy',
      source_type: 'HTTP',
      description: 'Dummy Pull',
      connection: {
        url: '/v1/enrich/ACM102/customerdata',
        headers: { 'content-type': 'application/json' },
      },
      table_name: 'job',
    };

    queryBuilder.returning.mockResolvedValueOnce([{ id: 'asd13as-asd13sfgwg-123jbuqr4', name: 'Test Job' }]);

    const job = await service.createPull(httpPayload as any);

    expect(job.id).toEqual('asd13as-asd13sfgwg-123jbuqr4');
    expect(queryBuilder.insert).toHaveBeenCalledWith({ ...httpPayload, id: 'asd13as-asd13sfgwg-123jbuqr4' });
    expect(job).toEqual({ id: 'asd13as-asd13sfgwg-123jbuqr4', name: 'Test Job' });
  });

  it('should hash password for SFTP job payload', async () => {
    const sftpPayload = {
      endpoint_name: 'SecureDummy',
      source_type: 'SFTP',
      description: 'SFTP Pull',
      connection: { host: 'sftp.example.com', username: 'user1', password: 'hashed_pass' },
      table_name: 'job',
    };

    const result = await service.createPull(sftpPayload as any);

    expect(result.id).toEqual('asd13as-asd13sfgwg-123jbuqr4');
    expect(queryBuilder.insert).toHaveBeenCalledWith({
      ...sftpPayload,
      id: 'asd13as-asd13sfgwg-123jbuqr4',
      connection: { host: 'sftp.example.com', username: 'user1', password: 'hashed_pass' },
    });
    const insertedPayload = (queryBuilder.insert as jest.Mock).mock.calls[0][0];
    expect(insertedPayload.connection.password).not.toEqual('plain_pass');
    expect(result).toEqual({ id: 'asd13as-asd13sfgwg-123jbuqr4', name: 'Inserted Job' });
  });

  it('should return a existing job', async () => {
    const job = await service.findOnePull('asd13as-asd13sfgwg-123jbuqr4');

    expect(queryBuilder.where).toHaveBeenCalledWith({ id: 'asd13as-asd13sfgwg-123jbuqr4' });
    expect(queryBuilder.first).toHaveBeenCalled();
    expect(job).toEqual({ id: 'asd13as-asd13sfgwg-123jbuqr4', name: 'Job 1' });
  });

  it('should throw error if job does not exist', async () => {
    queryBuilder.first.mockResolvedValue(null);
    await expect(service.findOnePull('asd13as-asd13sfgwg-123jbuqr4')).rejects.toThrow(NotFoundException);
  });
});
