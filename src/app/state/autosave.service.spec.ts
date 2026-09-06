import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { AutosaveService } from './autosave.service';
import { WorkspaceState } from './workspace-state';
import { FileOperationsService } from '../features/file-tree/file-operations.service';
import { FILE_SYSTEM_ADAPTER } from '../core/file-system-adapter';
import { BACKUP_STORE } from '../core/backup-store';
import { ERROR_REPORTER } from '../core/error-reporter';
import { NativeFileSystemAdapter } from '../adapters/filesystem/native-file-system-adapter';
import { IndexedDbBackupStore } from '../adapters/backup/indexeddb-backup-store';
import { NoopErrorReporter } from '../adapters/telemetry/noop-error-reporter';

function makeOpenFile(overrides: Partial<Parameters<WorkspaceState['setOpenFile']>[0]> = {}) {
  return {
    handle: {} as FileSystemFileHandle,
    path: 'notes.md',
    content: 'hello',
    dirty: true,
    saveState: 'unsaved' as const,
    saveError: null,
    saveErrorCode: null,
    lastKnownDiskMtime: 0,
    isMarkdown: true,
    isBinary: false,
    contentRevision: 1,
    ...overrides,
  };
}

describe('AutosaveService', () => {
  let state: WorkspaceState;
  let ops: FileOperationsService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        { provide: FILE_SYSTEM_ADAPTER, useClass: NativeFileSystemAdapter },
        { provide: BACKUP_STORE, useClass: IndexedDbBackupStore },
        { provide: ERROR_REPORTER, useClass: NoopErrorReporter },
      ],
    });
    state = TestBed.inject(WorkspaceState);
    ops = TestBed.inject(FileOperationsService);
    TestBed.inject(AutosaveService); // instantiate so its constructor effect registers
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call save() before the debounce window elapses', () => {
    const saveSpy = vi.spyOn(ops, 'save').mockResolvedValue();
    state.setOpenFile(makeOpenFile());
    TestBed.flushEffects();

    vi.advanceTimersByTime(2000);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('calls save() once the 2-3s debounce window elapses', () => {
    const saveSpy = vi.spyOn(ops, 'save').mockResolvedValue();
    state.setOpenFile(makeOpenFile());
    TestBed.flushEffects();

    vi.advanceTimersByTime(2600);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('does not schedule a save for a file that is not dirty', () => {
    const saveSpy = vi.spyOn(ops, 'save').mockResolvedValue();
    state.setOpenFile(makeOpenFile({ dirty: false, saveState: 'saved' }));
    TestBed.flushEffects();

    vi.advanceTimersByTime(5000);
    expect(saveSpy).not.toHaveBeenCalled();
  });
});
