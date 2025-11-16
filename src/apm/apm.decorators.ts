// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { ApmService } from './apm.service';
import type { Span } from 'elastic-apm-node';

/**
 * Decorator for method instrumentation with APM spans
 * Usage: @ApmSpan('operation-name')
 *
 * @param spanName - Name of the APM span
 * @returns Method decorator
 *
 * @example
 * ```typescript
 * class MyService {
 *   @ApmSpan('database-query')
 *   async findUser(id: string) {
 *     // Your method implementation
 *   }
 * }
 * ```
 */
export function ApmSpan(spanName: string): MethodDecorator {
  return function <T>(
    target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>,
  ): TypedPropertyDescriptor<T> | void {
    const originalMethod = descriptor.value;

    if (typeof originalMethod !== 'function') {
      return descriptor;
    }

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      // Try to get ApmService from the current instance
      let apmService: ApmService | undefined;

      // Check if the class has apmService as a property
      if (this && typeof this === 'object' && 'apmService' in this) {
        apmService = (this as Record<string, unknown>).apmService as ApmService;
      }

      if (!apmService) {
        // Fallback: execute without APM instrumentation
        return (originalMethod as (...args: unknown[]) => unknown).apply(this, args);
      }

      const span: Span | null = apmService.startSpan(spanName);

      try {
        const result = await (originalMethod as (...args: unknown[]) => Promise<unknown>).apply(this, args);

        if (span) {
          span.setOutcome('success');
          span.end();
        }

        return result;
      } catch (error) {
        if (span) {
          span.setOutcome('failure');
          span.end();
        }
        throw error;
      }
    } as T;

    return descriptor;
  };
}

/**
 * Injectable mixin that provides APM instrumentation methods
 * Extend your services from this class to get APM capabilities
 *
 * @example
 * ```typescript
 * @Injectable()
 * class MyService extends ApmInstrumented {
 *   constructor(apmService: ApmService) {
 *     super(apmService);
 *   }
 *
 *   async someMethod() {
 *     return this.withSpan('some-operation', async () => {
 *       // Your code here
 *     });
 *   }
 * }
 * ```
 */
@Injectable()
export abstract class ApmInstrumented {
  constructor(protected readonly apmService: ApmService) {}

  /**
   * Execute a function within an APM span
   * @param spanName - Name of the span
   * @param fn - Function to execute
   * @returns Promise with function result
   */
  protected async withSpan<T>(spanName: string, fn: () => Promise<T>): Promise<T> {
    const span = this.apmService.startSpan(spanName);

    try {
      const result = await fn();

      if (span) {
        span.setOutcome('success');
        span.end();
      }

      return result;
    } catch (error) {
      if (span) {
        span.setOutcome('failure');
        span.end();
      }
      throw error;
    }
  }

  /**
   * Execute a synchronous function within an APM span
   * @param spanName - Name of the span
   * @param fn - Function to execute
   * @returns Function result
   */
  protected withSpanSync<T>(spanName: string, fn: () => T): T {
    const span = this.apmService.startSpan(spanName);

    try {
      const result = fn();

      if (span) {
        span.setOutcome('success');
        span.end();
      }

      return result;
    } catch (error) {
      if (span) {
        span.setOutcome('failure');
        span.end();
      }
      throw error;
    }
  }
}
