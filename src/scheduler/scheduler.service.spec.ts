import { Test, TestingModule } from '@nestjs/testing';
import knex from 'knex';
import { SchedulerService } from './scheduler.service';

describe('SchedulerService', () => {
  let service: SchedulerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
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
