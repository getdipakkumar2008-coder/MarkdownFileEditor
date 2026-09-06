import { Component, output } from '@angular/core';
import { WorkspaceState } from '../../state/workspace-state';

/**
 * FR-14: exactly the four save states (Saved / Saving… / Unsaved changes /
 * Error saving — [reason]) — doc/specification.md §3.4.
 */
@Component({
  selector: 'app-toolbar',
  standalone: true,
  template: `
    <div class="toolbar" role="toolbar" aria-label="Editor toolbar">
      <button type="button" (click)="openFolder.emit()">Open Folder…</button>
      <button type="button" (click)="save.emit()" [disabled]="!state.openFile()">
        Save
      </button>
      <span class="mode-badge">{{ state.mode === 'native' ? 'Native file access' : 'Fallback mode (upload/download)' }}</span>
      <span class="save-state" [class]="state.saveState()">{{ saveLabel() }}</span>
    </div>
  `,
  styles: [
    `
      .toolbar {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem 0.75rem;
        border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent);
      }
      .mode-badge {
        font-size: 0.8em;
        opacity: 0.7;
      }
      .save-state.saved {
        color: seagreen;
      }
      .save-state.saving {
        opacity: 0.7;
      }
      .save-state.unsaved {
        color: darkorange;
      }
      .save-state.error {
        color: crimson;
      }
    `,
  ],
})
export class ToolbarComponent {
  readonly openFolder = output<void>();
  readonly save = output<void>();

  constructor(readonly state: WorkspaceState) {}

  saveLabel(): string {
    const file = this.state.openFile();
    switch (this.state.saveState()) {
      case 'saved':
        return 'Saved';
      case 'saving':
        return 'Saving…';
      case 'unsaved':
        return 'Unsaved changes';
      case 'error':
        return `Error saving — ${file?.saveError ?? 'unknown reason'}`;
    }
  }
}
