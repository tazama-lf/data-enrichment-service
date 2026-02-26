// SPDX-License-Identifier: Apache-2.0

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Apm } from '@tazama-lf/frms-coe-lib/lib/services/apm';
import type { Transaction, Span, TransactionOptions } from 'elastic-apm-node';

@Injectable()
export class ApmService implements OnModuleInit {
  private apm!: Apm;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.apm = new Apm({
      usePathAsTransactionName: true,
      transactionIgnoreUrls: ['/health', '/metrics'],
      captureBody: 'all',
      captureHeaders: true,
      environment: this.configService.get<string>('NODE_ENV', 'development'),
    });
  }

  /**
   * Start a new transaction for monitoring
   * @param name - Transaction name
   * @param options - Transaction options
   * @returns Transaction instance or null if APM is not active
   */
  startTransaction(name: string, options?: TransactionOptions): Transaction | null {
    return this.apm.startTransaction(name, options);
  }

  /**
   * Start a new span for monitoring
   * @param name - Span name
   * @returns Span instance or null if APM is not active
   */
  startSpan(name: string): Span | null {
    return this.apm.startSpan(name);
  }
}
