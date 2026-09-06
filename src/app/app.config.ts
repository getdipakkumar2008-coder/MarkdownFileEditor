import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { FILE_SYSTEM_ADAPTER } from './core/file-system-adapter';
import { MARKDOWN_RENDERER } from './core/markdown-renderer';
import { BACKUP_STORE } from './core/backup-store';
import { ERROR_REPORTER } from './core/error-reporter';
import { NativeFileSystemAdapter } from './adapters/filesystem/native-file-system-adapter';
import { FallbackFileSystemAdapter } from './adapters/filesystem/fallback-file-system-adapter';
import { supportsNativeFileSystemAccess } from './adapters/filesystem/capability-detector';
import { MarkdownItRenderer } from './adapters/markdown/markdown-it-renderer';
import { IndexedDbBackupStore } from './adapters/backup/indexeddb-backup-store';
import { TELEMETRY_CONFIG, DEFAULT_TELEMETRY_CONFIG, TelemetryConfig, shouldUseSentry } from './adapters/telemetry/telemetry-config';
import { NoopErrorReporter } from './adapters/telemetry/noop-error-reporter';
import { SentryErrorReporter } from './adapters/telemetry/sentry-error-reporter';
import { AppErrorHandler } from './core/app-error-handler';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Capability detection runs once here, at boot — never per-operation
    // inside a component (Architecture.md §2.1).
    {
      provide: FILE_SYSTEM_ADAPTER,
      useFactory: (native: NativeFileSystemAdapter, fallback: FallbackFileSystemAdapter) =>
        supportsNativeFileSystemAccess() ? native : fallback,
      deps: [NativeFileSystemAdapter, FallbackFileSystemAdapter],
    },
    { provide: MARKDOWN_RENDERER, useClass: MarkdownItRenderer },
    { provide: BACKUP_STORE, useClass: IndexedDbBackupStore },
    // Concrete DSN/backend is an infra decision not yet made (doc/specification.md §8)
    // — flip DEFAULT_TELEMETRY_CONFIG.enabled + sentryDsn later, no call-site changes needed.
    { provide: TELEMETRY_CONFIG, useValue: DEFAULT_TELEMETRY_CONFIG },
    {
      provide: ERROR_REPORTER,
      useFactory: (config: TelemetryConfig, noop: NoopErrorReporter, sentry: SentryErrorReporter) =>
        shouldUseSentry(config) ? sentry : noop,
      deps: [TELEMETRY_CONFIG, NoopErrorReporter, SentryErrorReporter],
    },
    { provide: ErrorHandler, useClass: AppErrorHandler },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
