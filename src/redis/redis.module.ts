import { Module } from '@nestjs/common';
import { RedisService } from '@tazama-lf/frms-coe-lib';
import redisConfig from './redis.config';

@Module({
  providers: [
    {
      provide: RedisService,
      useFactory: async () => {
        return await RedisService.create(redisConfig);
      },
    },
  ],
  exports: [RedisService],
})
export class RedisModule {}
