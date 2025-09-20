import { Test, TestingModule } from '@nestjs/testing';
import knex from 'knex';
import { JobService } from './job.service';
import { ConfigService } from '@nestjs/config';

describe('JobService', () => {
  let service: JobService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigService,
        JobService,
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
