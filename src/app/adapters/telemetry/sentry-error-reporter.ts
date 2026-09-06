import { Inject, Injectable } from '@angular/core';
import { ErrorMetadata, ErrorReporter, redactUnsafeMetadata } from '../../core/error-reporter';
import { TELEMETRY_CONFIG, TelemetryConfig } from './telemetry-config';

type SentryModule = typeof import('@sentry/browser');

/**
 * Selected as the active ERROR_REPORTER only when TelemetryConfig.enabled
 * and a DSN are both set (see app.config.ts) — otherwise NoopErrorReporter
 * is used instead, so this class never has to self-check "am I enabled".
 * The SDK is dynamically imported so it never lands in the main bundle for
 * users who never enable telemetry (Architecture.md §2.4).
 */
@Injectable({ providedIn: 'root' })
export class SentryErrorReporter implements ErrorReporter {
  private sentryPromise: Promise<SentryModule> | null = null;

  constructor(@Inject(TELEMETRY_CONFIG) private readonly config: TelemetryConfig) {}

  report(error: unknown, metadata: ErrorMetadata): void {
    const safe = redactUnsafeMetadata(metadata);
    void this.getSentry()
      .then((Sentry) => {
        Sentry.captureException(error, { tags: { code: safe.code }, extra: { ...safe } });
      })
      .catch(() => {
        // Telemetry must never itself become a user-facing failure.
      });
  }

  private getSentry(): Promise<SentryModule> {
    if (!this.sentryPromise) {
      this.sentryPromise = import('@sentry/browser').then((Sentry) => {
        Sentry.init({
          dsn: this.config.sentryDsn,
          sendDefaultPii: false, // never forward request PII — this app has no accounts anyway
        });
        return Sentry;
      });
    }
    return this.sentryPromise;
  }
}
