import { test, expect } from '@playwright/test';
import { installMockFileSystem } from './support/mock-native-fs';

// FR-18, US-3 (doc/specification.md §3.5, §7): DOMPurify must strip
// executable content from raw HTML embedded in Markdown — this is the
// security-critical path called out as non-negotiable in the spec.
const XSS_PAYLOADS: { name: string; markdown: string }[] = [
  { name: 'script tag', markdown: '# Title\n\n<script>window.__xssFired = true;</script>' },
  { name: 'img onerror', markdown: '<img src="x" onerror="window.__xssFired = true">' },
  { name: 'svg onload', markdown: '<svg onload="window.__xssFired = true"></svg>' },
  { name: 'javascript: href', markdown: '[click me](javascript:window.__xssFired=true)' },
  { name: 'iframe', markdown: '<iframe src="javascript:window.__xssFired=true"></iframe>' },
];

for (const { name, markdown } of XSS_PAYLOADS) {
  test(`sanitizes: ${name}`, async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __xssFired?: boolean }).__xssFired = false;
    });
    await page.addInitScript(installMockFileSystem, { 'payload.md': markdown });
    await page.goto('/');

    await page.getByRole('button', { name: 'Open Folder…' }).click();
    await page.getByRole('tree', { name: 'File explorer' }).getByText('payload.md').click();

    // Give the debounced preview render a moment, then confirm no payload fired.
    await page.waitForTimeout(500);
    const fired = await page.evaluate(() => (window as unknown as { __xssFired?: boolean }).__xssFired);
    expect(fired).toBe(false);

    const previewHtml = await page.getByLabel('Markdown preview').innerHTML();
    expect(previewHtml).not.toContain('<script');
    expect(previewHtml).not.toContain('onerror=');
    expect(previewHtml).not.toContain('onload=');
    // The javascript: payload case renders as inert literal text (markdown-it
    // refuses to linkify a javascript: scheme — no <a href> at all), so the
    // substring legitimately appears as escaped text; what actually matters
    // is that it's never a live, clickable href.
    expect(previewHtml).not.toContain('href="javascript:');
  });
}
