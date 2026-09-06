import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { PreviewComponent } from './preview.component';
import { WorkspaceState } from '../../state/workspace-state';
import { FILE_SYSTEM_ADAPTER } from '../../core/file-system-adapter';
import { MARKDOWN_RENDERER } from '../../core/markdown-renderer';
import { NativeFileSystemAdapter } from '../../adapters/filesystem/native-file-system-adapter';
import { MarkdownItRenderer } from '../../adapters/markdown/markdown-it-renderer';

function makeOpenFile(overrides: Partial<Parameters<WorkspaceState['setOpenFile']>[0]> = {}) {
  return {
    handle: {} as FileSystemFileHandle,
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

describe('PreviewComponent — debounced re-render (Performance NFR)', () => {
  let state: WorkspaceState;
  let fixture: ReturnType<typeof TestBed.createComponent<PreviewComponent>>;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [PreviewComponent],
      providers: [
        { provide: FILE_SYSTEM_ADAPTER, useClass: NativeFileSystemAdapter },
        { provide: MARKDOWN_RENDERER, useClass: MarkdownItRenderer },
      ],
    });
    state = TestBed.inject(WorkspaceState);
    fixture = TestBed.createComponent(PreviewComponent);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a newly opened file immediately, with no debounce delay', () => {
    state.setOpenFile(makeOpenFile({ content: '# Fresh open' }));
    fixture.detectChanges();

    const html = fixture.nativeElement.querySelector('.preview').innerHTML as string;
    expect(html).toContain('Fresh open');
  });

  it('does not re-render on the same file until the debounce window elapses', () => {
    state.setOpenFile(makeOpenFile({ content: '# v1' }));
    fixture.detectChanges();

    state.updateContent('# v2 typed');
    fixture.detectChanges();

    const htmlBeforeDebounce = fixture.nativeElement.querySelector('.preview').innerHTML as string;
    expect(htmlBeforeDebounce).toContain('v1');
    expect(htmlBeforeDebounce).not.toContain('v2 typed');

    vi.advanceTimersByTime(250);
    fixture.detectChanges();

    const htmlAfterDebounce = fixture.nativeElement.querySelector('.preview').innerHTML as string;
    expect(htmlAfterDebounce).toContain('v2 typed');
  });

  it('coalesces rapid keystrokes into a single re-render at the end of the debounce window', () => {
    state.setOpenFile(makeOpenFile({ content: '# start' }));
    fixture.detectChanges();

    state.updateContent('# a');
    fixture.detectChanges();
    vi.advanceTimersByTime(100);
    state.updateContent('# ab');
    fixture.detectChanges();
    vi.advanceTimersByTime(100);
    state.updateContent('# abc');
    fixture.detectChanges();

    // Neither earlier keystroke's 200ms window has fully elapsed yet.
    let html = fixture.nativeElement.querySelector('.preview').innerHTML as string;
    expect(html).toContain('start');

    vi.advanceTimersByTime(250);
    fixture.detectChanges();

    html = fixture.nativeElement.querySelector('.preview').innerHTML as string;
    expect(html).toContain('abc');
  });
});
