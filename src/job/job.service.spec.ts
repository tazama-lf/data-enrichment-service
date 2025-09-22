import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { JobService } from './job.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

describe('JobService', () => {
  let service: JobService;
  let fakeKnex: any;
  let queryBuilder: any;

  beforeEach(async () => {
    queryBuilder = {
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([{ id: 1, name: 'Job 1' }]),
      count: jest.fn().mockResolvedValue([{ count: 1 }]),
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ id: 1, name: 'Job 1' }),
      insert: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: 99, name: 'Inserted Job' }]),
    };

    fakeKnex = jest.fn().mockImplementation(() => queryBuilder);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('10') },
        },
        JobService,
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
      config_type: 'Pull',
      endpoint_name: 'Dummy',
      source_type: 'HTTP',
      description: 'Dummy Pull',
      connection: {
        url: '/v1/enrich/ACM102/customerdata',
        headers: { 'content-type': 'application/json' },
      },
      table_name: 'job',
    };

    queryBuilder.returning.mockResolvedValueOnce([{ id: 1, name: 'Test Job' }]);

    const job = await service.create(httpPayload as any);

    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(queryBuilder.insert).toHaveBeenCalledWith(httpPayload);
    expect(job).toEqual({ id: 1, name: 'Test Job' });
  });

  it('should hash password for SFTP job payload', async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_pass');

    const sftpPayload = {
      config_type: 'Pull',
      endpoint_name: 'SecureDummy',
      source_type: 'SFTP',
      description: 'SFTP Pull',
      connection: { host: 'sftp.example.com', username: 'user1', password: 'plain_pass' },
      table_name: 'job',
    };

    const result = await service.create(sftpPayload as any);

    expect(bcrypt.hash).toHaveBeenCalledWith('plain_pass', 10);
    expect(queryBuilder.insert).toHaveBeenCalledWith({
      ...sftpPayload,
      connection: { host: 'sftp.example.com', username: 'user1', password: 'hashed_pass' },
    });
    expect(result).toEqual({ id: 99, name: 'Inserted Job' });
  });

  it('return jobs with pagination', async () => {
    const jobs = await service.findAll(1, 10);

    expect(fakeKnex).toHaveBeenCalledWith('job');
    expect(queryBuilder.select).toHaveBeenCalledWith('*');
    expect(queryBuilder.limit).toHaveBeenCalledWith(10);
    expect(queryBuilder.offset).toHaveBeenCalledWith(0);
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('created_at', 'desc');
    expect(queryBuilder.count).toHaveBeenCalledWith('* as count');

    expect(jobs).toEqual([{ id: 1, name: 'Job 1' }]);
  });

  it('should return a existing job', async () => {
    const job = await service.findOne(1);

    expect(queryBuilder.where).toHaveBeenCalledWith({ id: 1 });
    expect(queryBuilder.first).toHaveBeenCalled();
    expect(job).toEqual({ id: 1, name: 'Job 1' });
  });

  it('should throw error if job does not exist', async () => {
    queryBuilder.first.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
  });
});
