import path from 'node:path';
import { test, expect } from '@playwright/test';

// US-8, Compatibility NFR (doc/specification.md §4): Firefox genuinely lacks
// showDirectoryPicker, so no mocking is needed here — this exercises the
// app's real capability detection (app.config.ts) and the real
// FallbackFileSystemAdapter driving a real <input webkitdirectory> upload,
// unlike the other specs which mock the native API for Chromium.
// Runs only under the "firefox" Playwright project (see playwright.config.ts).
test('falls back to upload/download mode automatically, labels the mode, and opens an uploaded file', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByText('Fallback mode (upload/download)')).toBeVisible();

  await page.getByRole('button', { name: 'Open Folder…' }).click();
  await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, 'fixtures', 'sample-folder'));

  const tree = page.getByRole('tree', { name: 'File explorer' });
  await expect(tree.getByText('notes.md')).toBeVisible();

  await tree.getByText('notes.md').click();
  await expect(page.locator('.cm-content')).toContainText('Fallback Test File');
});
