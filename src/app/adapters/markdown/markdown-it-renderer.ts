import { Injectable } from '@angular/core';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import { MarkdownRenderer } from '../../core/markdown-renderer';

const md: InstanceType<typeof MarkdownIt> = new MarkdownIt({
  html: true, // GFM allows raw HTML; DOMPurify below is what makes this safe.
  linkify: true,
  typographer: false,
  breaks: false,
});

/**
 * The only place markdown-it's raw output is allowed to exist before
 * sanitization. Do not export md.render directly from anywhere else in the
 * app (CLAUDE.md rule 2, Architecture.md §2.3).
 */
@Injectable({ providedIn: 'root' })
export class MarkdownItRenderer implements MarkdownRenderer {
  renderSafe(markdown: string): string {
    const rawHtml = md.render(markdown ?? '');
    return DOMPurify.sanitize(rawHtml, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ['target'],
    });
  }
}
