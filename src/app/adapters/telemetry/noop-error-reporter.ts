import { Injectable, isDevMode } from '@angular/core';
import { ErrorMetadata, ErrorReporter, redactUnsafeMetadata } from '../../core/error-reporter';

/**
 * Default reporter shipped in v1 — no network calls at all. Logs to the
 * console in dev mode only, so failures are still visible while developing
 * without needing a telemetry backend wired up (Architecture.md §2.4).
 */
@Injectable({ providedIn: 'root' })
export class NoopErrorReporter implements ErrorReporter {
  report(error: unknown, metadata: ErrorMetadata): void {
    if (!isDevMode()) return;
    const safe = redactUnsafeMetadata(metadata);
    // eslint-disable-next-line no-console
    console.error(`[error-reporter] ${safe.code}`, safe, error);
  }
}
