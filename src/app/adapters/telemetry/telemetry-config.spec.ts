import { DEFAULT_TELEMETRY_CONFIG, shouldUseSentry } from './telemetry-config';

describe('shouldUseSentry', () => {
  it('is false for the shipped default config (disabled, no DSN)', () => {
    expect(shouldUseSentry(DEFAULT_TELEMETRY_CONFIG)).toBe(false);
  });

  it('is false when enabled but no DSN is set', () => {
    expect(shouldUseSentry({ enabled: true, sentryDsn: '' })).toBe(false);
  });

  it('is false when a DSN is set but not enabled', () => {
    expect(shouldUseSentry({ enabled: false, sentryDsn: 'https://example.ingest.sentry.io/1' })).toBe(false);
  });

  it('is true only when both enabled and a DSN are set', () => {
    expect(shouldUseSentry({ enabled: true, sentryDsn: 'https://example.ingest.sentry.io/1' })).toBe(true);
  });
});
