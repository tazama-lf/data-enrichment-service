// SPDX-License-Identifier: Apache-2.0

import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { ApmService } from './apm.service';
import apm, { type Transaction } from 'elastic-apm-node';
import type { Request, Response } from 'express';

@Injectable()
export class ApmInterceptor implements NestInterceptor {
  constructor(private readonly apmService: ApmService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Create transaction name based on HTTP method and route
    const routePath = request.route?.path || request.url;
    const transactionName = `${request.method} ${routePath}`;

    const transaction: Transaction | null = this.apmService.startTransaction(transactionName);

    // Add labels for better filtering and analysis
    if (transaction) {
      transaction.addLabels({
        'http.method': request.method,
        'http.url': request.url,
        'user.agent': request.get('user-agent') || 'unknown',
      });
    }

    return next.handle().pipe(
      tap(() => {
        if (transaction) {
          transaction.result = 'success';
          transaction.setOutcome('success');
          transaction.addLabels({
            'http.status_code': response.statusCode,
          });
          transaction.end();
        }
      }),
      catchError((error: Error) => {
        if (transaction) {
          // Use global APM to capture error
          apm.captureError(error);
          transaction.result = 'error';
          transaction.setOutcome('failure');
          transaction.addLabels({
            'error.type': error.constructor.name,
            'error.message': error.message,
            'http.status_code': response.statusCode || 500,
          });
          transaction.end();
        }
        return throwError(() => error);
      }),
    );
  }
}
