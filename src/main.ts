import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ApmInterceptor } from './apm/apm.interceptor';
import { ApmService } from './apm/apm.service';
import { ConfigService } from '@nestjs/config';

dotenv.config();

const ERROR_EXIT_CODE = 1;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  const configService = app.get(ConfigService);

  // Initialize APM interceptor for global transaction monitoring
  const apmService = app.get(ApmService);
  app.useGlobalInterceptors(new ApmInterceptor(apmService));

  app.enableCors({
    origin: true,
    credentials: true,
  });
  const port = configService.get<number>('port', 3002);
  try {
    await app.listen(port);
    console.log(`Application is running on: http://localhost:${port}`);
  } catch (error) {
    console.error('Failed to start the application:', error);
    process.exit(ERROR_EXIT_CODE);
  }
}
bootstrap();
