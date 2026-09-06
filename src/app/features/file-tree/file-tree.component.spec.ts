import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { FileTreeComponent } from './file-tree.component';
import { WorkspaceState } from '../../state/workspace-state';
import { FILE_SYSTEM_ADAPTER, FileSystemAdapter, TreeEntry } from '../../core/file-system-adapter';
import { BACKUP_STORE } from '../../core/backup-store';
import { ERROR_REPORTER } from '../../core/error-reporter';
import { IndexedDbBackupStore } from '../../adapters/backup/indexeddb-backup-store';
import { NoopErrorReporter } from '../../adapters/telemetry/noop-error-reporter';

function makeFakeAdapter(): FileSystemAdapter {
  return {
    mode: 'native',
    openFolder: vi.fn(),
    listChildren: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue({ content: '', lastModified: 0, isBinary: false }),
    writeFile: vi.fn(),
    createFile: vi.fn(),
    createFolder: vi.fn(),
    rename: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn(),
    requestPersistedPermission: vi.fn().mockResolvedValue('granted'),
    queryPermission: vi.fn().mockResolvedValue('granted'),
  };
}

const rootHandle = {} as FileSystemDirectoryHandle;
const folderEntry: TreeEntry = {
  name: 'docs',
  kind: 'folder',
  handle: { kind: 'directory', name: 'docs' } as unknown as FileSystemDirectoryHandle,
  path: 'docs',
};

describe('FileTreeComponent — roving tabindex under a shrinking row list', () => {
  it('clamps focusedIndex when the visible rows shrink, so some row always keeps tabindex 0', () => {
    TestBed.configureTestingModule({
      imports: [FileTreeComponent],
      providers: [
        { provide: FILE_SYSTEM_ADAPTER, useValue: makeFakeAdapter() },
        { provide: BACKUP_STORE, useClass: IndexedDbBackupStore },
        { provide: ERROR_REPORTER, useClass: NoopErrorReporter },
      ],
    });

    const fixture = TestBed.createComponent(FileTreeComponent);
    const state = TestBed.inject(WorkspaceState);
    const component = fixture.componentInstance;

    // Root has one expanded folder with one child — two visible rows, focus on the child (index 1).
    state.setWorkspace(rootHandle, [folderEntry]);
    state.setChildren('docs', [
      { name: 'a.md', kind: 'file', handle: {} as FileSystemHandle, path: 'a.md' },
    ]);
    state.expandedPaths.set(new Set(['docs']));
    component.focusedIndex.set(1);
    fixture.detectChanges();

    expect(component.rows().length).toBe(2);
    expect(component.focusedIndex()).toBe(1);

    // Collapse — row list shrinks back to just the folder row (index 0).
    state.expandedPaths.set(new Set());
    fixture.detectChanges();

    expect(component.rows().length).toBe(1);
    expect(component.focusedIndex()).toBe(0); // clamped, not left pointing past the end
  });
});
