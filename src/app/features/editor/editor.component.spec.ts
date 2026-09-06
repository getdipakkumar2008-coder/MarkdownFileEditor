import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { EditorComponent } from './editor.component';
import { WorkspaceState } from '../../state/workspace-state';
import { FILE_SYSTEM_ADAPTER } from '../../core/file-system-adapter';
import { NativeFileSystemAdapter } from '../../adapters/filesystem/native-file-system-adapter';

function makeOpenFile(overrides: Partial<Parameters<WorkspaceState['setOpenFile']>[0]> = {}) {
  return {
    handle: { name: 'notes.md' } as FileSystemFileHandle,
    path: 'notes.md',
    content: '# v1',
    dirty: false,
    saveState: 'saved' as const,
    saveError: null,
    saveErrorCode: null,
    lastKnownDiskMtime: 0,
    isMarkdown: true,
    isBinary: false,
    contentRevision: 1,
    ...overrides,
  };
}

/**
 * Manual QA in Chrome caught this: reload-from-disk / restore-backup push
 * content into CodeMirror via view.dispatch() with the same file path —
 * without the fix, CodeMirror's updateListener can't tell that apart from
 * real typing and fires contentChanged, which re-marks the freshly-loaded
 * file as dirty even though nothing was actually typed.
 */
describe('EditorComponent — programmatic content reset must not emit contentChanged', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [EditorComponent],
      providers: [{ provide: FILE_SYSTEM_ADAPTER, useClass: NativeFileSystemAdapter }],
    });
    const state = TestBed.inject(WorkspaceState);
    state.setOpenFile(makeOpenFile());
    const fixture = TestBed.createComponent(EditorComponent);
    fixture.detectChanges(); // ngAfterViewInit creates the CodeMirror view
    return { fixture, state };
  }

  it('does not emit contentChanged when the same-path content is reset via a new revision (reload/restore)', () => {
    const { fixture, state } = setup();
    const emitted: string[] = [];
    fixture.componentInstance.contentChanged.subscribe((c: string) => emitted.push(c));

    // Same path, bumped revision — exactly what reloadFromDisk()/applyRecovery() produce.
    state.setContentFromExternalSource('# reloaded content');
    fixture.detectChanges();

    expect(emitted).toEqual([]);
  });

  it('still emits contentChanged for a real user edit dispatched directly into the view', () => {
    const { fixture } = setup();
    const emitted: string[] = [];
    fixture.componentInstance.contentChanged.subscribe((c: string) => emitted.push(c));

    const view = (fixture.componentInstance as unknown as { view: import('@codemirror/view').EditorView }).view;
    view.dispatch({ changes: { from: view.state.doc.length, insert: ' typed' } });

    expect(emitted).toEqual(['# v1 typed']);
  });
});
