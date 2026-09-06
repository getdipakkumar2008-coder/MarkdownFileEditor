import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { WorkspaceState } from './workspace-state';
import { FILE_SYSTEM_ADAPTER } from '../core/file-system-adapter';
import { NativeFileSystemAdapter } from '../adapters/filesystem/native-file-system-adapter';

function baseOpenFile() {
  return {
    handle: {} as FileSystemFileHandle,
    path: 'notes.md',
    content: 'on-disk content',
    dirty: false,
    saveState: 'saved' as const,
    saveError: null,
    saveErrorCode: null,
    lastKnownDiskMtime: 100,
    isMarkdown: true,
    isBinary: false,
    contentRevision: 0,
  };
}

describe('WorkspaceState — contentRevision (drives EditorComponent resync)', () => {
  let state: WorkspaceState;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: FILE_SYSTEM_ADAPTER, useClass: NativeFileSystemAdapter }],
    });
    state = TestBed.inject(WorkspaceState);
  });

  it('setOpenFile always assigns a fresh, increasing revision, even for the same path', () => {
    state.setOpenFile(baseOpenFile());
    const first = state.openFile()!.contentRevision;

    state.setOpenFile(baseOpenFile()); // same path — this is what reloadFromDisk() does
    const second = state.openFile()!.contentRevision;

    expect(second).toBeGreaterThan(first);
  });

  it('updateContent (user typing) does NOT bump contentRevision', () => {
    state.setOpenFile(baseOpenFile());
    const revision = state.openFile()!.contentRevision;

    state.updateContent('user typed this');

    expect(state.openFile()!.contentRevision).toBe(revision);
    expect(state.openFile()!.content).toBe('user typed this');
  });

  it('setContentFromExternalSource (restore backup) bumps contentRevision without touching path', () => {
    state.setOpenFile(baseOpenFile());
    const revision = state.openFile()!.contentRevision;
    const path = state.openFile()!.path;

    state.setContentFromExternalSource('restored backup content');

    expect(state.openFile()!.contentRevision).toBeGreaterThan(revision);
    expect(state.openFile()!.path).toBe(path);
    expect(state.openFile()!.content).toBe('restored backup content');
    expect(state.openFile()!.dirty).toBe(true);
  });
});
