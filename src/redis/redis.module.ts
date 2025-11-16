import { Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@tazama-lf/frms-coe-lib';
import { createRedisConfig } from './redis.config';

@Module({
  providers: [
    {
      provide: RedisService,
      useFactory: async (configService: ConfigService) => {
        const logger = new Logger('RedisModule');
        const redisConfig = createRedisConfig(configService);

        try {
          const redisService = await RedisService.create(redisConfig);
          logger.log('Redis server connected successfully');
          return redisService;
        } catch (error) {
          logger.error('Failed to connect to Redis server', error);
          throw error;
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: [RedisService],
})
export class RedisModule {}
