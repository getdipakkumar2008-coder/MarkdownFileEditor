import { Directive, ElementRef, HostListener, OnDestroy, OnInit, output } from '@angular/core';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessibility NFR (doc/specification.md §4): every modal dialog traps Tab
 * within itself, focuses its first (deliberately safest-first-in-template)
 * control on open, emits (escape) for the host to map to a cancel action
 * where one exists, and restores focus to whatever triggered it on close.
 */
@Directive({
  selector: '[appFocusTrap]',
  standalone: true,
})
export class FocusTrapDirective implements OnInit, OnDestroy {
  readonly escape = output<void>();
  private readonly previouslyFocused: Element | null = document.activeElement;

  constructor(private readonly el: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    queueMicrotask(() => {
      const first = this.focusableElements()[0];
      if (!first) return;
      first.focus();
      if (first instanceof HTMLInputElement || first instanceof HTMLTextAreaElement) {
        first.select();
      }
    });
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.escape.emit();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = this.focusableElements();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  ngOnDestroy(): void {
    if (this.previouslyFocused instanceof HTMLElement) {
      this.previouslyFocused.focus();
    }
  }

  private focusableElements(): HTMLElement[] {
    return Array.from(this.el.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }
}
