import { Test, TestingModule } from '@nestjs/testing';
import { ExecutorService } from './executor.service';
import { SchedulerRegistry } from '@nestjs/schedule';

describe('ExecutorService', () => {
  let service: ExecutorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExecutorService, SchedulerRegistry],
    }).compile();

    service = module.get<ExecutorService>(ExecutorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
