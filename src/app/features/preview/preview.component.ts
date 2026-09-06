import { Component, Inject, OnDestroy, computed, effect, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MARKDOWN_RENDERER, MarkdownRenderer } from '../../core/markdown-renderer';
import { WorkspaceState } from '../../state/workspace-state';

/** Performance NFR (doc/specification.md §4): debounce re-render, don't re-parse on every keystroke. */
const PREVIEW_DEBOUNCE_MS = 200;

/**
 * FR-16..18: renders via MarkdownRenderer.renderSafe() only — the output is
 * already DOMPurify-sanitized by the adapter, so bypassSecurityTrustHtml here
 * is safe specifically because that single upstream call point guarantees it.
 * Do not add a second render path that skips renderSafe().
 */
@Component({
  selector: 'app-preview',
  standalone: true,
  template: `<div class="preview" [innerHTML]="html()"></div>`,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        overflow: auto;
      }
      .preview {
        padding: 1rem;
      }
    `,
  ],
})
export class PreviewComponent implements OnDestroy {
  private readonly debouncedContent = signal('');
  private lastPath: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    @Inject(MARKDOWN_RENDERER) private readonly renderer: MarkdownRenderer,
    private readonly state: WorkspaceState,
    private readonly sanitizer: DomSanitizer
  ) {
    effect(() => {
      const file = this.state.openFile();
      if (!file) {
        this.clearTimer();
        this.debouncedContent.set('');
        return;
      }
      if (file.path !== this.lastPath) {
        // Different file just opened — render immediately, no debounce
        // delay (a blank/stale preview flash on open would be worse UX
        // than the keystroke-debounce this NFR is actually about).
        this.lastPath = file.path;
        this.clearTimer();
        this.debouncedContent.set(file.content);
        return;
      }
      // Same file, content changed under our feet (a keystroke) — debounce.
      this.clearTimer();
      this.timer = setTimeout(() => this.debouncedContent.set(file.content), PREVIEW_DEBOUNCE_MS);
    });
  }

  readonly html = computed<SafeHtml>(() => {
    const raw = this.renderer.renderSafe(this.debouncedContent());
    return this.sanitizer.bypassSecurityTrustHtml(raw);
  });

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }
}
