import { Test, TestingModule } from '@nestjs/testing';
import knex from 'knex';
import { ExecutorService } from '../executor/executor.service';
import { JobController } from './job.controller';
import { JobService } from './job.service';

describe('JobController', () => {
  let controller: JobController;
  let fakeJobService: Partial<JobService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobController],
      providers: [
        { provide: JobService, useValue: fakeJobService },
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

    controller = module.get<JobController>(JobController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
