import { Component, Input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { BackupRecord } from '../../core/backup-store';

/** FR-13: recovery is always an explicit user choice, never auto-applied. */
@Component({
  selector: 'app-recovery-dialog',
  standalone: true,
  template: `
    <div class="backdrop" role="presentation">
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="recovery-title">
        <h2 id="recovery-title">Unsaved backup found</h2>
        <p>
          A newer, unsaved version of <strong>{{ backup.path }}</strong> was recovered from a
          previous session (saved {{ backup.savedAt | date: 'medium' }}). Restore it, or keep the
          version currently on disk?
        </p>
        <div class="actions">
          <button type="button" (click)="discard.emit()">Keep disk version</button>
          <button type="button" class="primary" (click)="restore.emit()">Restore backup</button>
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
        max-width: 420px;
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
  imports: [DatePipe],
})
export class RecoveryDialogComponent {
  @Input({ required: true }) backup!: BackupRecord;

  readonly restore = output<void>();
  readonly discard = output<void>();
}
