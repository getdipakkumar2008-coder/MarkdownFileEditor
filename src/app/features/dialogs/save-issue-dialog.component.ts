import { Component, Input, output } from '@angular/core';
import { SaveErrorCode } from '../../state/workspace-state';
import { FocusTrapDirective } from './focus-trap.directive';

/**
 * Reliability NFRs (doc/specification.md): never silently clobber a file
 * that changed externally, and never fail a save silently when permission
 * was revoked — both get an explicit modal with a real recovery action,
 * not just a toolbar error string. Escape only dismisses for the
 * single-safe-action cases (not-found/disk-full/unknown) — external-mod and
 * permission-revoked require an explicit pick, same reasoning as the
 * recovery dialog.
 */
@Component({
  selector: 'app-save-issue-dialog',
  standalone: true,
  imports: [FocusTrapDirective],
  template: `
    <div class="backdrop" role="presentation">
      <div
        class="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="issue-title"
        appFocusTrap
        (escape)="onEscape()"
      >
        <h2 id="issue-title">{{ title() }}</h2>
        <p>{{ message }}</p>
        <div class="actions">
          @if (code === 'external-modification') {
            <button type="button" (click)="reload.emit()">Reload from disk (discard my edits)</button>
            <button type="button" class="primary" (click)="overwrite.emit()">Overwrite anyway</button>
          } @else if (code === 'permission-revoked') {
            <button type="button" class="primary" (click)="regrant.emit()">Grant access again</button>
          } @else {
            <button type="button" class="primary" (click)="dismiss.emit()">Dismiss</button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
      }
      .dialog {
        background: Canvas;
        color: CanvasText;
        border-radius: 8px;
        padding: 1.25rem 1.5rem;
        max-width: 440px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 1rem;
      }
      .primary {
        font-weight: 600;
      }
    `,
  ],
})
export class SaveIssueDialogComponent {
  @Input({ required: true }) code!: SaveErrorCode;
  @Input({ required: true }) message!: string;

  readonly overwrite = output<void>();
  readonly reload = output<void>();
  readonly regrant = output<void>();
  readonly dismiss = output<void>();

  onEscape(): void {
    if (this.code !== 'external-modification' && this.code !== 'permission-revoked') {
      this.dismiss.emit();
    }
  }

  title(): string {
    switch (this.code) {
      case 'external-modification':
        return 'File changed on disk';
      case 'permission-revoked':
        return 'Folder access revoked';
      case 'not-found':
        return 'File not found';
      case 'disk-full':
        return 'Disk full';
      default:
        return 'Save failed';
    }
  }
}
