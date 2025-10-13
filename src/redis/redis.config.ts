import { RedisConfig } from '@tazama-lf/frms-coe-lib/lib/interfaces';

const redisConfig: RedisConfig = {
  db: 0,
  servers: [
    {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    },
  ],
  password: process.env.REDIS_PASSWORD || '',
  isCluster: false,
};

export default redisConfig;
