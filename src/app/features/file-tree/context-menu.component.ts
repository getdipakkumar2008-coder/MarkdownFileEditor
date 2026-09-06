import { Component, ElementRef, HostListener, Input, ViewChild, AfterViewInit, output } from '@angular/core';

export interface ContextMenuAction {
  id: string;
  label: string;
  danger?: boolean;
}

/**
 * FR-3 (doc/specification.md §3.1): right-click and keyboard-equivalent
 * context menu. Dismisses on outside click, Escape, or scroll — standard
 * context-menu behavior.
 */
@Component({
  selector: 'app-context-menu',
  standalone: true,
  template: `
    <ul #menu class="menu" role="menu" [style.left.px]="x" [style.top.px]="y">
      @for (item of items; track item.id) {
        <li role="menuitem" tabindex="0" [class.danger]="item.danger" (click)="onSelect(item.id)" (keydown.enter)="onSelect(item.id)">
          {{ item.label }}
        </li>
      }
    </ul>
  `,
  styles: [
    `
      .menu {
        position: fixed;
        list-style: none;
        margin: 0;
        padding: 0.25rem;
        min-width: 160px;
        background: Canvas;
        color: CanvasText;
        border-radius: 6px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
        z-index: 200;
      }
      li {
        padding: 0.4rem 0.6rem;
        border-radius: 4px;
        cursor: pointer;
      }
      li:hover,
      li:focus {
        background: color-mix(in srgb, currentColor 12%, transparent);
        outline: none;
      }
      li.danger {
        color: crimson;
      }
    `,
  ],
})
export class ContextMenuComponent implements AfterViewInit {
  @Input({ required: true }) x = 0;
  @Input({ required: true }) y = 0;
  @Input({ required: true }) items: ContextMenuAction[] = [];

  @ViewChild('menu') menuRef?: ElementRef<HTMLUListElement>;

  readonly select = output<string>();
  readonly dismiss = output<void>();

  ngAfterViewInit(): void {
    // Keep the menu fully on-screen even when opened near the viewport edge.
    const el = this.menuRef?.nativeElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const overflowX = rect.right - window.innerWidth;
    const overflowY = rect.bottom - window.innerHeight;
    if (overflowX > 0) el.style.left = `${this.x - overflowX}px`;
    if (overflowY > 0) el.style.top = `${this.y - overflowY}px`;
  }

  onSelect(id: string): void {
    this.select.emit(id);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.dismiss.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.dismiss.emit();
  }

  @HostListener('document:contextmenu')
  onDocumentContextMenu(): void {
    this.dismiss.emit();
  }
}
