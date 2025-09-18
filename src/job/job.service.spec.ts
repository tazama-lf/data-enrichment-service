import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import knex from 'knex';
import { ExecutorService } from '../executor/executor.service';
import { JobService } from './job.service';

describe('JobService', () => {
  let service: JobService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobService,
        SchedulerRegistry,
        ExecutorService,
        {
          provide: 'KNEX_CONNECTION',
          useValue: knex({
            client: 'pg',
            connection: process.env.DATABSE_URL,
          }),
        },
      ],
    }).compile();

    service = module.get<JobService>(JobService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
