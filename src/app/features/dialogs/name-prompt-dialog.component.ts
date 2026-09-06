import { Component, Input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FocusTrapDirective } from './focus-trap.directive';

/** Used for New File / New Folder / Rename — validates a bare filename before emitting confirm. */
@Component({
  selector: 'app-name-prompt-dialog',
  standalone: true,
  imports: [FormsModule, FocusTrapDirective],
  template: `
    <div class="backdrop" role="presentation">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="prompt-title" appFocusTrap (escape)="cancel.emit()">
        <h2 id="prompt-title">{{ title }}</h2>
        <form (ngSubmit)="onSubmit()">
          <input type="text" [(ngModel)]="value" name="entryName" [attr.aria-label]="title" autocomplete="off" />
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <div class="actions">
            <button type="button" (click)="cancel.emit()">Cancel</button>
            <button type="submit" class="primary">{{ confirmLabel }}</button>
          </div>
        </form>
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
        max-width: 380px;
        width: 100%;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      }
      input {
        width: 100%;
        box-sizing: border-box;
        padding: 0.4rem 0.5rem;
        margin-top: 0.5rem;
      }
      .error {
        color: var(--status-danger);
        font-size: 0.85em;
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
export class NamePromptDialogComponent implements OnInit {
  @Input({ required: true }) title!: string;
  @Input() initialValue = '';
  @Input() confirmLabel = 'Create';

  readonly confirm = output<string>();
  readonly cancel = output<void>();

  value = '';
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    // appFocusTrap focuses+selects the first focusable element (this input) after view init.
    this.value = this.initialValue;
  }

  onSubmit(): void {
    const trimmed = this.value.trim();
    if (!trimmed) {
      this.error.set('Name cannot be empty.');
      return;
    }
    if (trimmed.includes('/') || trimmed.includes('\\')) {
      this.error.set('Name cannot contain a path separator.');
      return;
    }
    if (trimmed === '.' || trimmed === '..') {
      this.error.set('That name is not allowed.');
      return;
    }
    this.confirm.emit(trimmed);
  }
}
