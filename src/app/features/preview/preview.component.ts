import { Component, Inject, computed } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MARKDOWN_RENDERER, MarkdownRenderer } from '../../core/markdown-renderer';
import { WorkspaceState } from '../../state/workspace-state';

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
export class PreviewComponent {
  constructor(
    @Inject(MARKDOWN_RENDERER) private readonly renderer: MarkdownRenderer,
    private readonly state: WorkspaceState,
    private readonly sanitizer: DomSanitizer
  ) {}

  readonly html = computed<SafeHtml>(() => {
    const file = this.state.openFile();
    const raw = this.renderer.renderSafe(file?.content ?? '');
    return this.sanitizer.bypassSecurityTrustHtml(raw);
  });
}
