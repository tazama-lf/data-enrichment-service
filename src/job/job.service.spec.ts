import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutorService } from '../executor/executor.service';
import { JobService } from './job.service';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { DatabaseService } from '../database/database.service';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'asd13as-asd13sfgwg-123jbuqr4'),
}));

describe('JobService', () => {
  let service: JobService;
  let db: DatabaseService;

  beforeEach(async () => {
    db = {
      tableExist: jest.fn().mockResolvedValue(false),
      ensureTable: jest.fn().mockResolvedValue(true),
      query: jest.fn().mockResolvedValue({ rows: [] }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobService,
        { provide: DatabaseService, useValue: db },
        { provide: ExecutorService, useValue: { dryRun: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('10') } },
        { provide: LoggerService, useValue: { log: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service = module.get<JobService>(JobService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw error if job does not exist', async () => {
    await expect(service.findOnePull('asd13as-asd13sfgwg-123jbuqr4')).rejects.toThrow(NotFoundException);
  });
});
