import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  output,
} from '@angular/core';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands';
import { searchKeymap, search } from '@codemirror/search';
import { markdown } from '@codemirror/lang-markdown';
import { WorkspaceState } from '../../state/workspace-state';

/**
 * FR-8..10 (doc/specification.md §3.3): CodeMirror 6 is the only editor
 * implementation — no contentEditable (CLAUDE.md rule 4).
 */
@Component({
  selector: 'app-editor',
  standalone: true,
  template: `<div #host class="editor-host"></div>`,
  styles: [
    `
      .editor-host {
        height: 100%;
        overflow: auto;
      }
      :host {
        display: block;
        height: 100%;
      }
    `,
  ],
})
export class EditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;

  readonly contentChanged = output<string>();
  readonly saveRequested = output<void>();

  private view?: EditorView;
  private lastLoadedPath: string | null = null;
  private lastLoadedRevision = -1;

  constructor(private readonly state: WorkspaceState) {
    effect(() => {
      const file = this.state.openFile();
      if (!file || !this.view) return;
      // Reset the doc when a different file was opened, OR when the same
      // file's content was overwritten from outside the editor's own typing
      // (reload-from-disk / restore-backup bump contentRevision without
      // changing path — see WorkspaceState.OpenFile.contentRevision). Plain
      // user keystrokes never reach this branch, so cursor/undo state is
      // preserved for normal typing.
      if (file.path !== this.lastLoadedPath || file.contentRevision !== this.lastLoadedRevision) {
        this.lastLoadedPath = file.path;
        this.lastLoadedRevision = file.contentRevision;
        this.view.dispatch({
          changes: { from: 0, to: this.view.state.doc.length, insert: file.content },
        });
      }
    });
  }

  ngAfterViewInit(): void {
    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          this.saveRequested.emit();
          return true;
        },
      },
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
    ]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        this.contentChanged.emit(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: this.state.openFile()?.content ?? '',
      extensions: [lineNumbers(), history(), search(), markdown(), saveKeymap, updateListener],
    });

    this.view = new EditorView({ state, parent: this.host.nativeElement });
    this.lastLoadedPath = this.state.openFile()?.path ?? null;
    this.lastLoadedRevision = this.state.openFile()?.contentRevision ?? -1;
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }
}
