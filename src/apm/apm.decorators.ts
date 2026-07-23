// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { ApmService } from './apm.service';
import type { Span } from 'elastic-apm-node';

/**
 * Decorator for async method instrumentation with APM spans
 *
 * ⚠️ WARNING: This decorator only works with async methods!
 * It converts the decorated method to return a Promise.
 * For synchronous methods, use @ApmSpanSync decorator instead,
 * or extend ApmInstrumented and use withSpanSync().
 *
 * Usage: @ApmSpan('operation-name')
 *
 * @param spanName - Name of the APM span
 * @returns Method decorator
 *
 * @example
 * ```typescript
 * class MyService {
 *   @ApmSpan('database-query')
 *   async findUser(id: string) {  // Must be async!
 *     // Your method implementation
 *   }
 * }
 * ```
 */
export function ApmSpan(spanName: string): MethodDecorator {
  return function (target: unknown, propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
    const { value: originalMethod } = descriptor as { value: unknown };

    descriptor.value = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
      let apmService: ApmService | undefined;

      if (this !== null && typeof this === 'object' && 'apmService' in this) {
        ({ apmService } = this as { apmService?: ApmService });
      }

      if (!apmService) {
        return (originalMethod as (...a: unknown[]) => unknown).apply(this, args);
      }

      const span: Span | null = apmService.startSpan(spanName);

      try {
        const result = await (originalMethod as (...a: unknown[]) => Promise<unknown>).apply(this, args);

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
    };

    return descriptor;
  };
}

export function ApmSpanSync(spanName: string): MethodDecorator {
  return (target: unknown, propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor => {
    const { value: originalMethod } = descriptor as { value: unknown };

    descriptor.value = function (this: unknown, ...args: unknown[]): unknown {
      let apmService: ApmService | undefined;

      if (this !== null && typeof this === 'object' && 'apmService' in this) {
        ({ apmService } = this as { apmService?: ApmService });
      }

      if (!apmService) {
        return (originalMethod as (...a: unknown[]) => unknown).apply(this, args);
      }

      const span: Span | null = apmService.startSpan(spanName);

      try {
        const result = (originalMethod as (...a: unknown[]) => unknown).apply(this, args);

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
    };

    return descriptor;
  };
}
@Injectable()
export abstract class ApmInstrumented {
  constructor(protected readonly apmService: ApmService) {}

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
