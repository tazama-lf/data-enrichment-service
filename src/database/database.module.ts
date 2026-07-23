import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { LoggerModule } from '../logger-service/logger-service.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
  imports: [LoggerModule, ConfigModule],
})
export class DatabaseModule {}
