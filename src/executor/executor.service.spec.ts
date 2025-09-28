import { Test, TestingModule } from '@nestjs/testing';
import { ExecutorService } from './executor.service';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerService } from '@tazama-lf/frms-coe-lib';

describe('ExecutorService', () => {
  let service: ExecutorService;

  const mockLoggerService = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExecutorService, { provide: LoggerService, useValue: mockLoggerService }],
      imports: [ScheduleModule.forRoot()],
    }).compile();

    service = module.get<ExecutorService>(ExecutorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
