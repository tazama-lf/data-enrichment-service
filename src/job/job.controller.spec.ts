import { Test, TestingModule } from '@nestjs/testing';
import { ExecutorService } from '../executor/executor.service';
import { JobController } from './job.controller';
import { JobService } from './job.service';
import { CreatePullJobDto } from './dto/create-pull-job.dto';
import { SchedulerService } from '../scheduler/scheduler.service';

describe('JobController', () => {
  let controller: JobController;
  let service: JobService;
  let fakeKnex: any;
  let fakeSchedulerService: SchedulerService;
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
        {
          provide: SchedulerService,
          useValue: fakeSchedulerService,
        },
        {
          provide: 'KNEX_CONNECTION',
          useValue: fakeKnex,
        },
      ],
    }).compile();

    controller = module.get<JobController>(JobController);
    service = module.get<JobService>(JobService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create job and return result successfully', async () => {
    const dto: CreatePullJobDto = {
      endpoint_name: 'Dummy',
      source_type: 'HTTP',
      description: 'Dummy Pull',
      connection: { url: '/test', headers: {} },
      table_name: 'job',
    } as any;

    const expectedResult = { id: 1, ...dto };
    mockJobService.createPull.mockResolvedValue(expectedResult);

    const result = await controller.createPullJob(dto);

    expect(service.createPull).toHaveBeenCalledWith(dto);
    expect(result).toEqual(expectedResult);
  });
});
