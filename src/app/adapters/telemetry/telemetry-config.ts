import { InjectionToken } from '@angular/core';

export interface TelemetryConfig {
  /** Off by default — flip once a concrete backend/DSN is decided (doc/specification.md §8, Architecture.md §2.4). */
  enabled: boolean;
  sentryDsn: string;
}

/**
 * Deliberately empty/disabled — the concrete backend is an infra decision
 * not yet made. Ops flips this later without touching any call site, since
 * everything above ERROR_REPORTER only depends on the ErrorReporter interface.
 */
export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  enabled: false,
  sentryDsn: '',
};

export const TELEMETRY_CONFIG = new InjectionToken<TelemetryConfig>('TELEMETRY_CONFIG');

/** Pure so the provider-selection rule is unit-testable without spinning up DI. */
export function shouldUseSentry(config: TelemetryConfig): boolean {
  return config.enabled && config.sentryDsn.length > 0;
}
