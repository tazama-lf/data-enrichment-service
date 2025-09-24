import { Test, TestingModule } from '@nestjs/testing';
import { ExecutorService } from '../executor/executor.service';
import { JobController } from './job.controller';
import { JobService } from './job.service';
import { CreateJobDto } from './dto/create-job.dto';
import { SchedulerService } from '../scheduler/scheduler.service';

describe('JobController', () => {
  let controller: JobController;
  let service: JobService;
  let fakeKnex: any;
  let fakeSchedulerService: SchedulerService;
  let fakeExecutorService: ExecutorService;

  const mockJobService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
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
    const dto: CreateJobDto = {
      config_type: 'Pull',
      endpoint_name: 'Dummy',
      source_type: 'HTTP',
      description: 'Dummy Pull',
      connection: { url: '/test', headers: {} },
      table_name: 'job',
    } as any;

    const expectedResult = { id: 1, ...dto };
    mockJobService.create.mockResolvedValue(expectedResult);

    const result = await controller.createJob(dto);

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(result).toEqual(expectedResult);
  });

  it('should return jobs with page and limit provided', async () => {
    const jobs = [{ id: 1, name: 'Job 1' }];
    mockJobService.findAll.mockResolvedValue(jobs);

    const result = await controller.getAll(2, 5);

    expect(service.findAll).toHaveBeenCalledWith(2, 5);
    expect(result).toEqual(jobs);
  });

  it('should return jobs with page and limit not provided', async () => {
    const jobs = [{ id: 1, name: 'Job 1' }];
    mockJobService.findAll.mockResolvedValue(jobs);

    const result = await controller.getAll(undefined, undefined);

    expect(service.findAll).toHaveBeenCalledWith(1, 10);
    expect(result).toEqual(jobs);
  });
});
