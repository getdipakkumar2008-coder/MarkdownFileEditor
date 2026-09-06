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

  constructor(private readonly state: WorkspaceState) {
    effect(() => {
      const file = this.state.openFile();
      if (!file || !this.view) return;
      // Only reset the doc when a different file was opened — avoid
      // clobbering cursor position / undo history on every content signal tick.
      if (file.path !== this.lastLoadedPath) {
        this.lastLoadedPath = file.path;
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
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }
}
