// SPDX-License-Identifier: Apache-2.0

import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApmService } from './apm.service';

/**
 * Global APM module that provides Application Performance Monitoring services
 * throughout the entire application. This module initializes APM on application
 * startup and provides services for transaction and span tracking.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [ApmService],
  exports: [ApmService],
})
export class ApmModule {}
