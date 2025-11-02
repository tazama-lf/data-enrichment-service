import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { DatabaseService } from '../database/database.service';
import { ExecutorService } from '../executor/executor.service';
import { JobService } from './job.service';
import { SchedulerRegistry } from '@nestjs/schedule';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'asd13as-asd13sfgwg-123jbuqr4'),
}));

describe('JobService', () => {
  let service: JobService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobService,
        { provide: DatabaseService, useValue: {} },
        { provide: RedisService, useValue: {} },
        { provide: SchedulerRegistry, useValue: {} },
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
});
