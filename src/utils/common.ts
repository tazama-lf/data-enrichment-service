export interface ErrorResponse {
  isMatch: boolean;
  message: string;
  differences: string[];
  schema?: unknown;
}

export interface ErrorPattern {
  pattern: string;
  condition?: (msg: string) => boolean;
  exception: new (message: string) => Error;
  log: 'warn' | 'error';
  getMessage: (context: string, additionalInfo?: Record<string, unknown>) => string;
}
