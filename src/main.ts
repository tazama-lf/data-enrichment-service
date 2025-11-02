import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });
import './apm';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.enableCors({
    origin: true,
    credentials: true,
  });
  await app.listen(process.env.PORT || 3001);
}
bootstrap();
