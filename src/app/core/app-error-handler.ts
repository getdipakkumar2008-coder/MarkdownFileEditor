import { ErrorHandler, Inject, Injectable, isDevMode } from '@angular/core';
import { ERROR_REPORTER, ErrorReporter, ErrorMetadata } from './error-reporter';
import { FileSystemOperationError } from './file-system-adapter';

/**
 * Catches anything that wasn't already classified and handled by
 * FileOperationsService (a genuine bug, not an expected save/read failure).
 * provideBrowserGlobalErrorListeners() (app.config.ts) routes window
 * 'error' and 'unhandledrejection' events here too, so this is the single
 * backstop for truly uncaught errors.
 */
@Injectable()
export class AppErrorHandler implements ErrorHandler {
  constructor(@Inject(ERROR_REPORTER) private readonly reporter: ErrorReporter) {}

  handleError(error: unknown): void {
    if (isDevMode()) {
      // eslint-disable-next-line no-console
      console.error(error);
    }
    const code = error instanceof FileSystemOperationError ? error.code : 'uncaught';
    const metadata: ErrorMetadata = { code };
    this.reporter.report(error, metadata);
  }
}
