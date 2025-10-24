import { Test, TestingModule } from '@nestjs/testing';
import { ExecutorService } from './executor.service';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerService, RedisService } from '@tazama-lf/frms-coe-lib';
import { DatabaseService } from '../database/database.service';
import { HttpService } from '@nestjs/axios';

describe('ExecutorService', () => {
  let service: ExecutorService;

  const mockLoggerService = {
    error: jest.fn(),
    warn: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutorService,
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: DatabaseService, useValue: {} },
        { provide: RedisService, useValue: {} },
        { provide: HttpService, useValue: {} },
      ],
      imports: [ScheduleModule.forRoot()],
    }).compile();

    service = module.get<ExecutorService>(ExecutorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
