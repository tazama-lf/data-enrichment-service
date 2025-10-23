import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from './database.service';
import { LoggerService } from '@tazama-lf/frms-coe-lib';

describe('DatabaseService', () => {
  let service: DatabaseService;

  const mockLoggerService = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DatabaseService, { provide: LoggerService, useValue: mockLoggerService }],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
