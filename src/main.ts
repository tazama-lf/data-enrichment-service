import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ApmInterceptor } from './apm/apm.interceptor';
import { ApmService } from './apm/apm.service';
import { ConfigService } from '@nestjs/config';
import { json, } from 'express';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  const configService = app.get(ConfigService);

  // Initialize APM interceptor for global transaction monitoring
  const apmService = app.get(ApmService);
  app.useGlobalInterceptors(new ApmInterceptor(apmService));
  app.use(json({ limit: configService.get<string>('size', '100mb') }));
  app.enableCors({
    origin: true,
    credentials: true,
  });
  const port = configService.get<number>('port', 3001);

  await app.listen(port);
}

bootstrap().catch(() => {
  process.exit(1);
});
