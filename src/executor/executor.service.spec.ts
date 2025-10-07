import { Test, TestingModule } from '@nestjs/testing';
import { ExecutorService } from './executor.service';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { DatabaseService } from '../database/database.service';

describe('ExecutorService', () => {
  let service: ExecutorService;
  let db: DatabaseService;

  const mockLoggerService = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExecutorService, { provide: LoggerService, useValue: mockLoggerService }, { provide: DatabaseService, useValue: db }],
      imports: [ScheduleModule.forRoot()],
    }).compile();

    service = module.get<ExecutorService>(ExecutorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
