import { plainToClass } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsNumberString, IsOptional, IsString, validateSync } from 'class-validator';

enum NodeEnv {
  DEVELOPMENT = 'dev',
  PRODUCTION = 'prod',
  TEST = 'test',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv;

  @IsNumberString()
  MAX_CPU: string;

  @IsString()
  FUNCTION_NAME: string;

  @IsString()
  CONFIGURATION_DATABASE_URL: string;

  @IsString()
  ENCRYPTION_KEY: string;

  @IsNumber()
  SALT_ROUNDS: number;

  @IsNumber()
  CACHE_TTL: number;

  @IsString()
  DAILY_CRON: string;

  @IsString()
  REDIS_HOST: string;

  @IsNumber()
  REDIS_PORT: number;

  @IsString()
  REDIS_PASSWORD: string;

  @IsString()
  SERVER_URL: string;

  @IsString()
  STARTUP_TYPE: string;

  @IsString()
  PRODUCER_STREAM: string;

  @IsString()
  CONSUMER_STREAM: string;

  @IsString()
  STREAM_SUBJECT: string;

  @IsBoolean()
  APM_ACTIVE: boolean;

  @IsString()
  APM_URL: string;

  @IsOptional()
  @IsString()
  APM_SECRET_TOKEN?: string;

  @IsString()
  APM_SERVICE_NAME: string;

  @IsString()
  TAZAMA_AUTH_URL: string;

  @IsString()
  AUTH_PUBLIC_KEY_PATH: string;

  @IsString()
  CERT_PATH_PUBLIC: string;

  @IsOptional()
  @IsString()
  SIDECAR_HOST: string;

  @IsOptional()
  @IsString()
  LOGSTASH_LEVEL: string;
}

export const validate = (config: Record<string, unknown>) => {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
};
