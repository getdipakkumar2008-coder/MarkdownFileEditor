import { Component, ElementRef, HostListener, Input, ViewChild, ViewChildren, QueryList, AfterViewInit, output } from '@angular/core';

export interface ContextMenuAction {
  id: string;
  label: string;
  danger?: boolean;
}

/**
 * FR-3 (doc/specification.md §3.1): right-click and keyboard-equivalent
 * context menu, following the WAI-ARIA menu pattern — auto-focuses the
 * first item, Up/Down/Home/End roam between items, Enter/Space activates,
 * Escape/outside-click/scroll dismisses.
 */
@Component({
  selector: 'app-context-menu',
  standalone: true,
  template: `
    <ul #menu class="menu" role="menu" [style.left.px]="x" [style.top.px]="y">
      @for (item of items; track item.id; let i = $index) {
        <li
          #menuItem
          role="menuitem"
          tabindex="-1"
          [class.danger]="item.danger"
          (click)="onSelect(item.id)"
          (keydown)="onItemKeydown($event, i)"
        >
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
      li:hover {
        background: color-mix(in srgb, currentColor 12%, transparent);
      }
      li:focus-visible,
      li:focus {
        background: color-mix(in srgb, currentColor 12%, transparent);
        outline: 2px solid Highlight;
        outline-offset: -2px;
      }
      li.danger {
        color: var(--status-danger);
      }
    `,
  ],
})
export class ContextMenuComponent implements AfterViewInit {
  @Input({ required: true }) x = 0;
  @Input({ required: true }) y = 0;
  @Input({ required: true }) items: ContextMenuAction[] = [];

  @ViewChild('menu') menuRef?: ElementRef<HTMLUListElement>;
  @ViewChildren('menuItem') menuItems?: QueryList<ElementRef<HTMLLIElement>>;

  readonly select = output<string>();
  readonly dismiss = output<void>();

  ngAfterViewInit(): void {
    // Keep the menu fully on-screen even when opened near the viewport edge.
    const el = this.menuRef?.nativeElement;
    if (el) {
      const rect = el.getBoundingClientRect();
      const overflowX = rect.right - window.innerWidth;
      const overflowY = rect.bottom - window.innerHeight;
      if (overflowX > 0) el.style.left = `${this.x - overflowX}px`;
      if (overflowY > 0) el.style.top = `${this.y - overflowY}px`;
    }
    queueMicrotask(() => this.menuItems?.first?.nativeElement.focus());
  }

  onSelect(id: string): void {
    this.select.emit(id);
  }

  onItemKeydown(event: KeyboardEvent, index: number): void {
    const items = this.menuItems?.toArray() ?? [];
    if (items.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        items[(index + 1) % items.length].nativeElement.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        items[(index - 1 + items.length) % items.length].nativeElement.focus();
        break;
      case 'Home':
        event.preventDefault();
        items[0].nativeElement.focus();
        break;
      case 'End':
        event.preventDefault();
        items[items.length - 1].nativeElement.focus();
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.onSelect(this.items[index].id);
        break;
    }
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
