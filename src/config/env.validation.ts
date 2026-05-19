import { plainToClass, Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsNumberString, IsOptional, IsString, validateSync } from 'class-validator';

const DEFAULT_HTTP_TIMEOUT_MS = 30000;

export enum NodeEnv {
  DEVELOPMENT = 'dev',
  PRODUCTION = 'prod',
  TEST = 'test',
}

export class EnvironmentVariables {
  @IsString()
  FUNCTION_NAME!: string;

  @IsEnum(NodeEnv)
  NODE_ENV!: NodeEnv;

  @IsNumberString()
  MAX_CPU!: string;

  @IsString()
  CONFIGURATION_DATABASE_URL!: string;

  @IsString()
  ENCRYPTION_KEY!: string;

  @IsString()
  CORS_ORIGINS!: string;

  @IsNumber()
  SALT_ROUNDS!: number;

  @IsNumber()
  PORT!: number;

  @IsString()
  SIZE!: string;

  @IsNumber()
  CACHE_TTL!: number;

  @IsOptional()
  @IsNumber()
  HTTP_TIMEOUT?: number = DEFAULT_HTTP_TIMEOUT_MS;

  @IsString()
  REDIS_HOST!: string;

  @IsNumber()
  REDIS_PORT!: number;

  @IsString()
  REDIS_PASSWORD!: string;

  @IsString()
  SERVER_URL!: string;

  @IsString()
  STARTUP_TYPE!: string;

  @IsString()
  PRODUCER_STREAM!: string;

  @IsString()
  CONSUMER_STREAM!: string;

  @IsString()
  STREAM_SUBJECT!: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  APM_ACTIVE?: boolean;

  @IsOptional()
  @IsString()
  APM_URL?: string;

  @IsOptional()
  @IsString()
  APM_SECRET_TOKEN?: string;

  @IsOptional()
  @IsString()
  APM_SERVICE_NAME?: string;

  @IsString()
  TAZAMA_AUTH_URL!: string;

  @IsString()
  AUTH_PUBLIC_KEY_PATH!: string;

  @IsString()
  CERT_PATH_PUBLIC!: string;

  @IsOptional()
  @IsString()
  SIDECAR_HOST?: string;

  @IsOptional()
  @IsString()
  LOGSTASH_LEVEL?: string;

  @IsString()
  DB_HOST!: string;

  @IsNumber()
  DB_PORT!: number;

  @IsString()
  DB_USER!: string;

  @IsString()
  DB_PASSWORD!: string;

  @IsOptional()
  @IsString()
  DB_CERT_PATH?: string;

  @IsOptional()
  @IsNumber()
  BATCH_SIZE?: number;
}

export const validate = (config: Record<string, unknown>): EnvironmentVariables => {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors.map((err) => Object.values(err.constraints ?? {}).join(', ')).join('; ');
    throw new Error(`Environment validation failed: ${messages}`);
  }

  return validatedConfig;
};
