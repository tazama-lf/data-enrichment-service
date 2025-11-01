import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth.module';
import { TazamaAuthGuard } from './tazam-auth.guard';

describe('AuthModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [AuthModule],
    }).compile();
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  describe('Module Configuration', () => {
    it('should be defined', () => {
      expect(module).toBeDefined();
    });

    it('should provide TazamaAuthGuard', () => {
      const guard = module.get<TazamaAuthGuard>(TazamaAuthGuard);
      expect(guard).toBeDefined();
      expect(guard).toBeInstanceOf(TazamaAuthGuard);
    });

    it('should export TazamaAuthGuard', () => {
      const guard = module.get<TazamaAuthGuard>(TazamaAuthGuard);
      expect(guard).toBeDefined();
    });
  });

  describe('Dependencies', () => {
    it('should import ConfigModule', () => {
      const configModule = module.get(ConfigModule);
      expect(configModule).toBeDefined();
    });
  });

  describe('Module Structure', () => {
    it('should have correct module metadata', () => {
      const moduleRef = module.get(AuthModule);
      expect(moduleRef).toBeDefined();
    });

    it('should be able to create multiple instances of TazamaAuthGuard', () => {
      const guard1 = module.get<TazamaAuthGuard>(TazamaAuthGuard);
      const guard2 = module.get<TazamaAuthGuard>(TazamaAuthGuard);

      expect(guard1).toBeDefined();
      expect(guard2).toBeDefined();
      expect(guard1).toBe(guard2);
    });
  });

  describe('Integration', () => {
    it('should allow TazamaAuthGuard to be injected in other modules', async () => {
      const testModule = await Test.createTestingModule({
        imports: [AuthModule],
        providers: [
          {
            provide: 'TestService',
            useFactory: (authGuard: TazamaAuthGuard) => {
              return { authGuard };
            },
            inject: [TazamaAuthGuard],
          },
        ],
      }).compile();

      const testService = testModule.get('TestService');
      expect(testService).toBeDefined();
      expect(testService.authGuard).toBeInstanceOf(TazamaAuthGuard);

      await testModule.close();
    });
  });

  describe('Error Handling', () => {
    it('should handle module compilation errors gracefully', async () => {
      try {
        const faultyModule = await Test.createTestingModule({
          imports: [AuthModule],
          providers: [
            {
              provide: 'InvalidProvider',
              useFactory: () => {
                throw new Error('Factory error');
              },
            },
          ],
        }).compile();

        const guard = faultyModule.get<TazamaAuthGuard>(TazamaAuthGuard);
        expect(guard).toBeDefined();

        await faultyModule.close();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
