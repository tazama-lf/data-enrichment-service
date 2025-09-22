import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerService } from './scheduler.service';
import { ExecutorService } from '../executor/executor.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import knex from 'knex';

describe('SchedulerService', () => {
  let service: SchedulerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
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

    service = module.get<SchedulerService>(SchedulerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
