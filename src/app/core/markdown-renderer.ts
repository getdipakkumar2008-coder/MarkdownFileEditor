import { InjectionToken } from '@angular/core';

/**
 * Sole render path from raw Markdown to DOM-safe HTML. There must be exactly
 * one implementation registered, and it must sanitize internally — no call
 * site is trusted to remember to sanitize (Architecture.md §2.3, CLAUDE.md rule 2).
 */
export interface MarkdownRenderer {
  renderSafe(markdown: string): string;
}

export const MARKDOWN_RENDERER = new InjectionToken<MarkdownRenderer>('MARKDOWN_RENDERER');
