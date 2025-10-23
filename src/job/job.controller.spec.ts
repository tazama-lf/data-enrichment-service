import { Test, TestingModule } from '@nestjs/testing';
import { ExecutorService } from '../executor/executor.service';
import { JobController } from './job.controller';
import { JobService } from './job.service';

describe('JobController', () => {
  let controller: JobController;
  let service: JobService;
  let fakeExecutorService: ExecutorService;

  const mockJobService = {
    createPull: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobController],
      providers: [
        { provide: JobService, useValue: mockJobService },
        { provide: ExecutorService, useValue: fakeExecutorService },
      ],
    }).compile();

    controller = module.get<JobController>(JobController);
    service = module.get<JobService>(JobService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
