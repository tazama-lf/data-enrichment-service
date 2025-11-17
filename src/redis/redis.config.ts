import type { ConfigService } from '@nestjs/config';
import type { RedisConfig } from '@tazama-lf/frms-coe-lib/lib/interfaces';

export const createRedisConfig = (configService: ConfigService): RedisConfig => {
  const host = configService.get<string>('REDIS_HOST');
  const port = configService.get<number>('REDIS_PORT');
  const password = configService.get<string>('REDIS_PASSWORD');

  if (!host || !port || !password) {
    throw new Error('Redis configuration is incomplete. Check REDIS_HOST, REDIS_PORT, and REDIS_PASSWORD environment variables.');
  }

  return {
    db: configService.get<number>('REDIS_DB', 0),
    servers: [
      {
        host,
        port,
      },
    ],
    password,
    isCluster: false,
  };
};
