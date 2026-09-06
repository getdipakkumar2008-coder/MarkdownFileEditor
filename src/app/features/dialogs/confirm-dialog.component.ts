import { Component, Input, output } from '@angular/core';

/** CLAUDE.md rule 5: delete (and any irreversible op) requires an explicit confirm dialog — no silent/optimistic deletes. */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  template: `
    <div class="backdrop" role="presentation">
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{{ title }}</h2>
        <p>{{ message }}</p>
        <div class="actions">
          <button type="button" (click)="cancel.emit()">Cancel</button>
          <button type="button" class="danger" (click)="confirm.emit()">{{ confirmLabel }}</button>
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
      .danger {
        color: crimson;
        font-weight: 600;
      }
    `,
  ],
})
export class ConfirmDialogComponent {
  @Input({ required: true }) title!: string;
  @Input({ required: true }) message!: string;
  @Input() confirmLabel = 'Delete';

  readonly confirm = output<void>();
  readonly cancel = output<void>();
}
