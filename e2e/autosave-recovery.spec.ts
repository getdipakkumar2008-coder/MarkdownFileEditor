import { test, expect } from '@playwright/test';
import { installMockFileSystem } from './support/mock-native-fs';

// US-5, FR-11..15 (doc/specification.md §3.4): debounced autosave, and the
// IndexedDB crash-recovery prompt — driven via a real page reload plus a
// backup seeded directly into the same IndexedDB store the app uses, so
// this exercises the app's actual recovery-detection code path rather than
// a mocked one.
test('autosave writes to disk ~2-3s after the last keystroke, with no explicit save action', async ({ page }) => {
  await page.addInitScript(installMockFileSystem, { 'notes.md': '# v1' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Folder…' }).click();
  await page.getByRole('tree', { name: 'File explorer' }).getByText('notes.md').click();

  const editorContent = page.locator('.cm-content');
  await editorContent.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' autosaved text');

  await expect(page.getByRole('status')).toHaveText('Unsaved changes');
  // AUTOSAVE_DEBOUNCE_MS is 2500ms — give it real margin without asserting on the exact constant.
  await expect(page.getByRole('status')).toHaveText('Saved', { timeout: 5000 });

  const savedContent = await page.evaluate(() => {
    const root = (window as unknown as { __mockFsRoot: { children: Map<string, { content?: string }> } })
      .__mockFsRoot;
    return root.children.get('notes.md')?.content;
  });
  expect(savedContent).toContain('autosaved text');
});

test('offers to restore a newer IndexedDB backup on open, and never applies it silently (FR-13)', async ({
  page,
}) => {
  await page.addInitScript(installMockFileSystem, { 'notes.md': '# on-disk version' });
  await page.goto('/');

  // Seed a backup directly into the same IndexedDB store IndexedDbBackupStore
  // writes to, dated after the mock file's mtime (fresh Date.now() at open).
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('md-editor-backups', 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('backups', { keyPath: 'path' });
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('backups', 'readwrite');
          tx.objectStore('backups').put({
            path: 'notes.md',
            content: '# recovered backup version',
            savedAt: Date.now() + 60_000, // safely newer than the file's just-created mtime
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      })
  );

  await page.getByRole('button', { name: 'Open Folder…' }).click();
  await page.getByRole('tree', { name: 'File explorer' }).getByText('notes.md').click();

  const recoveryDialog = page.getByRole('alertdialog', { name: 'Unsaved backup found' });
  await expect(recoveryDialog).toBeVisible();

  // Editor should still show the on-disk content until the user chooses.
  await expect(page.locator('.cm-content')).toContainText('on-disk version');

  await recoveryDialog.getByRole('button', { name: 'Restore backup' }).click();
  await expect(recoveryDialog).toHaveCount(0);
  await expect(page.locator('.cm-content')).toContainText('recovered backup version');
});
