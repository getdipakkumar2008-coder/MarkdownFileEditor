import { NativeFileSystemAdapter } from './native-file-system-adapter';
import { FileSystemOperationError } from '../../core/file-system-adapter';

function makeThrowingFileHandle(error: DOMException): FileSystemFileHandle {
  return {
    kind: 'file',
    name: 'notes.md',
    getFile: vi.fn().mockRejectedValue(error),
    createWritable: vi.fn().mockRejectedValue(error),
  } as unknown as FileSystemFileHandle;
}

describe('NativeFileSystemAdapter — error classification', () => {
  let adapter: NativeFileSystemAdapter;

  beforeEach(() => {
    adapter = new NativeFileSystemAdapter();
  });

  it('classifies NotAllowedError as permission-revoked on read', async () => {
    const handle = makeThrowingFileHandle(new DOMException('denied', 'NotAllowedError'));
    await expect(adapter.readFile(handle)).rejects.toMatchObject({
      code: 'permission-revoked',
    } satisfies Partial<FileSystemOperationError>);
  });

  it('classifies NotFoundError as not-found on write', async () => {
    const handle = makeThrowingFileHandle(new DOMException('gone', 'NotFoundError'));
    await expect(adapter.writeFile(handle, 'x')).rejects.toMatchObject({ code: 'not-found' });
  });

  it('classifies QuotaExceededError as disk-full on write', async () => {
    const handle = makeThrowingFileHandle(new DOMException('full', 'QuotaExceededError'));
    await expect(adapter.writeFile(handle, 'x')).rejects.toMatchObject({ code: 'disk-full' });
  });

  it('falls back to unknown for an unrecognized DOMException', async () => {
    const handle = makeThrowingFileHandle(new DOMException('weird', 'SomeOtherError'));
    await expect(adapter.readFile(handle)).rejects.toMatchObject({ code: 'unknown' });
  });
});
