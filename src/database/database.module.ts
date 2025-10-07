import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { LoggerModule } from '../logger-service/logger-service.module';

@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
  imports: [LoggerModule],
})
export class DatabaseModule {}
