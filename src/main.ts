import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ApmInterceptor } from './apm/apm.interceptor';
import { ApmService } from './apm/apm.service';
import { ConfigService } from '@nestjs/config';
import { json } from 'express';
dotenv.config({ path: '.env' });

const DEFAULT_PORT = 3001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  const configService = app.get(ConfigService);

  // Initialize APM interceptor for global transaction monitoring
  const apmService = app.get(ApmService);
  app.useGlobalInterceptors(new ApmInterceptor(apmService));
  app.use(json({ limit: configService.get<string>('SIZE', '100mb') }));
  app.enableCors({
    origin: configService.get<string>('CORS_ORIGINS', 'localhost').split(','),
    credentials: true,
  });
  const port = configService.get<number>('PORT', DEFAULT_PORT);

  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Application failed to start: ${errorMessage}\n`);
  process.exit(1);
});
