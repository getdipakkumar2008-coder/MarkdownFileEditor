import { AppErrorHandler } from './app-error-handler';
import { FileSystemOperationError } from './file-system-adapter';
import { ErrorReporter } from './error-reporter';

describe('AppErrorHandler', () => {
  function makeHandler() {
    const reporter: ErrorReporter = { report: vi.fn() };
    const handler = new AppErrorHandler(reporter);
    return { handler, reporter };
  }

  it('reports a FileSystemOperationError with its classified code', () => {
    const { handler, reporter } = makeHandler();
    const err = new FileSystemOperationError('disk-full', 'full');
    handler.handleError(err);
    expect(reporter.report).toHaveBeenCalledWith(err, { code: 'disk-full' });
  });

  it('reports an arbitrary uncaught error as code "uncaught"', () => {
    const { handler, reporter } = makeHandler();
    const err = new Error('some bug');
    handler.handleError(err);
    expect(reporter.report).toHaveBeenCalledWith(err, { code: 'uncaught' });
  });
});
