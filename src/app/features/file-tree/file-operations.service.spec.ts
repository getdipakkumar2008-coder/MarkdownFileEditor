import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { FileOperationsService } from './file-operations.service';
import { WorkspaceState } from '../../state/workspace-state';
import { FILE_SYSTEM_ADAPTER, FileSystemAdapter, FileSystemOperationError } from '../../core/file-system-adapter';
import { BACKUP_STORE } from '../../core/backup-store';
import { ERROR_REPORTER } from '../../core/error-reporter';
import { IndexedDbBackupStore } from '../../adapters/backup/indexeddb-backup-store';
import { NoopErrorReporter } from '../../adapters/telemetry/noop-error-reporter';

function makeFakeAdapter(overrides: Partial<FileSystemAdapter> = {}): FileSystemAdapter {
  return {
    mode: 'native',
    openFolder: vi.fn(),
    listChildren: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue({ content: 'on-disk content', lastModified: 100, isBinary: false }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    createFile: vi.fn(),
    createFolder: vi.fn(),
    rename: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn(),
    requestPersistedPermission: vi.fn().mockResolvedValue('granted'),
    queryPermission: vi.fn().mockResolvedValue('granted'),
    ...overrides,
  };
}

describe('FileOperationsService — reliability/conflict handling', () => {
  let state: WorkspaceState;
  let ops: FileOperationsService;
  let adapter: FileSystemAdapter;

  function setup(adapterOverrides: Partial<FileSystemAdapter> = {}) {
    adapter = makeFakeAdapter(adapterOverrides);
    TestBed.configureTestingModule({
      providers: [
        { provide: FILE_SYSTEM_ADAPTER, useValue: adapter },
        { provide: BACKUP_STORE, useClass: IndexedDbBackupStore },
        { provide: ERROR_REPORTER, useClass: NoopErrorReporter },
      ],
    });
    state = TestBed.inject(WorkspaceState);
    ops = TestBed.inject(FileOperationsService);
  }

  it('blocks the save and reports permission-revoked when queryPermission is not granted', async () => {
    setup({ queryPermission: vi.fn().mockResolvedValue('denied') });
    state.rootHandle.set({} as FileSystemDirectoryHandle);
    state.setOpenFile({
      handle: {} as FileSystemFileHandle,
      path: 'notes.md',
      content: 'edited',
      dirty: true,
      saveState: 'unsaved',
      saveError: null,
      saveErrorCode: null,
      lastKnownDiskMtime: 0,
      isMarkdown: true,
      isBinary: false,
    });

    await ops.save();

    expect(state.openFile()?.saveState).toBe('error');
    expect(state.openFile()?.saveErrorCode).toBe('permission-revoked');
    expect(adapter.writeFile).not.toHaveBeenCalled();
  });

  it('blocks the save and reports external-modification when disk mtime is newer than lastKnownDiskMtime', async () => {
    setup(); // readFile mock returns lastModified: 100
    state.rootHandle.set(null); // skip permission check path entirely
    state.setOpenFile({
      handle: {} as FileSystemFileHandle,
      path: 'notes.md',
      content: 'edited',
      dirty: true,
      saveState: 'unsaved',
      saveError: null,
      saveErrorCode: null,
      lastKnownDiskMtime: 50, // older than the 100 the mocked adapter returns
      isMarkdown: true,
      isBinary: false,
    });

    await ops.save();

    expect(state.openFile()?.saveState).toBe('error');
    expect(state.openFile()?.saveErrorCode).toBe('external-modification');
    expect(adapter.writeFile).not.toHaveBeenCalled();
  });

  it('overwriteAnyway forces the save past an external-modification conflict', async () => {
    setup();
    state.rootHandle.set(null);
    state.setOpenFile({
      handle: {} as FileSystemFileHandle,
      path: 'notes.md',
      content: 'edited',
      dirty: true,
      saveState: 'unsaved',
      saveError: null,
      saveErrorCode: null,
      lastKnownDiskMtime: 50,
      isMarkdown: true,
      isBinary: false,
    });

    await ops.overwriteAnyway();

    expect(adapter.writeFile).toHaveBeenCalledWith(expect.anything(), 'edited');
    expect(state.openFile()?.saveState).toBe('saved');
  });

  it('reloadFromDisk discards local edits and re-reads the file', async () => {
    setup();
    const handle = { name: 'notes.md' } as FileSystemFileHandle;
    state.setOpenFile({
      handle,
      path: 'notes.md',
      content: 'my unsaved edits',
      dirty: true,
      saveState: 'error',
      saveError: 'conflict',
      saveErrorCode: 'external-modification',
      lastKnownDiskMtime: 50,
      isMarkdown: true,
      isBinary: false,
    });

    await ops.reloadFromDisk();

    expect(state.openFile()?.content).toBe('on-disk content');
    expect(state.openFile()?.dirty).toBe(false);
    expect(state.openFile()?.saveState).toBe('saved');
  });

  it('classifies a thrown FileSystemOperationError code through to save-error state', async () => {
    setup({
      writeFile: vi.fn().mockRejectedValue(new FileSystemOperationError('disk-full', 'The disk appears to be full.')),
    });
    state.rootHandle.set(null);
    state.setOpenFile({
      handle: {} as FileSystemFileHandle,
      path: 'notes.md',
      content: 'edited',
      dirty: true,
      saveState: 'unsaved',
      saveError: null,
      saveErrorCode: null,
      lastKnownDiskMtime: 100, // matches mocked readFile, so it passes the mtime check
      isMarkdown: true,
      isBinary: false,
    });

    await ops.save();

    expect(state.openFile()?.saveErrorCode).toBe('disk-full');
    expect(state.openFile()?.saveError).toContain('disk appears to be full');
  });

  it('regrantPermissionAndRetry re-requests permission and retries the save on success', async () => {
    const requestPersistedPermission = vi.fn().mockResolvedValue('granted');
    setup({ requestPersistedPermission });
    state.rootHandle.set({} as FileSystemDirectoryHandle);
    state.setOpenFile({
      handle: {} as FileSystemFileHandle,
      path: 'notes.md',
      content: 'edited',
      dirty: true,
      saveState: 'error',
      saveError: 'revoked',
      saveErrorCode: 'permission-revoked',
      lastKnownDiskMtime: 100,
      isMarkdown: true,
      isBinary: false,
    });

    await ops.regrantPermissionAndRetry();

    expect(requestPersistedPermission).toHaveBeenCalled();
    expect(adapter.writeFile).toHaveBeenCalled();
    expect(state.openFile()?.saveState).toBe('saved');
  });
});

describe('FileOperationsService — tree expansion and scoped CRUD refresh', () => {
  let state: WorkspaceState;
  let ops: FileOperationsService;
  let adapter: FileSystemAdapter;

  function setup(adapterOverrides: Partial<FileSystemAdapter> = {}) {
    adapter = makeFakeAdapter(adapterOverrides);
    TestBed.configureTestingModule({
      providers: [
        { provide: FILE_SYSTEM_ADAPTER, useValue: adapter },
        { provide: BACKUP_STORE, useClass: IndexedDbBackupStore },
        { provide: ERROR_REPORTER, useClass: NoopErrorReporter },
      ],
    });
    state = TestBed.inject(WorkspaceState);
    ops = TestBed.inject(FileOperationsService);
  }

  const rootHandle = { kind: 'directory', name: 'root' } as unknown as FileSystemDirectoryHandle;
  const folderEntry = {
    name: 'docs',
    kind: 'folder' as const,
    handle: { kind: 'directory', name: 'docs' } as unknown as FileSystemDirectoryHandle,
    path: 'docs',
  };

  it('toggleFolder loads and caches children on first expand, does not re-fetch on second expand', async () => {
    setup({ listChildren: vi.fn().mockResolvedValue([{ name: 'a.md', kind: 'file', handle: {} as FileSystemHandle, path: 'a.md' }]) });
    state.setWorkspace(rootHandle, [folderEntry]);

    await ops.toggleFolder(folderEntry, 'docs');
    expect(state.expandedPaths().has('docs')).toBe(true);
    expect(state.childrenCache().get('docs')?.map((e) => e.name)).toEqual(['a.md']);
    expect(adapter.listChildren).toHaveBeenCalledTimes(1);

    // collapse
    await ops.toggleFolder(folderEntry, 'docs');
    expect(state.expandedPaths().has('docs')).toBe(false);

    // re-expand — cache hit, no second fetch
    await ops.toggleFolder(folderEntry, 'docs');
    expect(adapter.listChildren).toHaveBeenCalledTimes(1);
  });

  it('createFile inside a nested folder refreshes only that folder\'s cache, not the root tree', async () => {
    setup();
    state.setWorkspace(rootHandle, [folderEntry]);
    state.setChildren('docs', []);
    state.expandedPaths.set(new Set(['docs']));

    (adapter.listChildren as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'new.md', kind: 'file', handle: {} as FileSystemHandle, path: 'new.md' },
    ]);

    await ops.createFile(folderEntry.handle, 'docs', 'new.md');

    expect(adapter.createFile).toHaveBeenCalledWith(folderEntry.handle, 'new.md');
    expect(state.childrenCache().get('docs')?.map((e) => e.name)).toEqual(['new.md']);
    expect(state.tree()).toEqual([folderEntry]); // root tree untouched
  });

  it('renaming a folder collapses its subtree so stale cached paths are not shown under the old name', async () => {
    setup();
    state.setWorkspace(rootHandle, [folderEntry]);
    state.setChildren('docs', [{ name: 'a.md', kind: 'file', handle: {} as FileSystemHandle, path: 'a.md' }]);
    state.expandedPaths.set(new Set(['docs']));

    await ops.rename(rootHandle, null, folderEntry.handle, 'docs', 'renamed-docs');

    expect(state.expandedPaths().has('docs')).toBe(false);
    expect(state.childrenCache().has('docs')).toBe(false);
  });

  it('deleting an expanded folder collapses its subtree and refreshes the parent', async () => {
    setup();
    state.setWorkspace(rootHandle, [folderEntry]);
    state.setChildren('docs', [{ name: 'a.md', kind: 'file', handle: {} as FileSystemHandle, path: 'a.md' }]);
    state.expandedPaths.set(new Set(['docs']));
    (adapter.listChildren as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await ops.remove(rootHandle, null, folderEntry.handle, 'docs');

    expect(state.childrenCache().has('docs')).toBe(false);
    expect(state.tree()).toEqual([]);
  });
});
