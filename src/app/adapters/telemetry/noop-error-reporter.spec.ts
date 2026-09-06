import { NoopErrorReporter } from './noop-error-reporter';

describe('NoopErrorReporter', () => {
  it('does not throw when reporting', () => {
    const reporter = new NoopErrorReporter();
    expect(() => reporter.report(new Error('boom'), { code: 'unknown' })).not.toThrow();
  });
});
