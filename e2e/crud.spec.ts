import { test, expect } from '@playwright/test';
import { installMockFileSystem } from './support/mock-native-fs';

// US-6, FR-3/5/6 (doc/specification.md §3.1-3.2): create/rename/delete via
// the context menu, with an explicit confirm dialog before delete
// (CLAUDE.md rule 5 — no silent/optimistic deletes).
test.describe('File tree CRUD', () => {
  test('creates a new file at root via the toolbar button, then it appears in the tree', async ({ page }) => {
    await page.addInitScript(installMockFileSystem, { 'existing.md': '# existing' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Folder…' }).click();

    await page.getByRole('button', { name: 'New File' }).click();
    await page.getByRole('dialog', { name: 'New file name' }).getByRole('textbox').fill('created.md');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByRole('tree', { name: 'File explorer' }).getByText('created.md')).toBeVisible();
  });

  test('renames a file via the context menu', async ({ page }) => {
    await page.addInitScript(installMockFileSystem, { 'old-name.md': '# content' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Folder…' }).click();

    const tree = page.getByRole('tree', { name: 'File explorer' });
    await tree.getByText('old-name.md').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Rename' }).click();

    const input = page.getByRole('dialog').getByRole('textbox');
    await expect(input).toHaveValue('old-name.md');
    await input.fill('new-name.md');
    await page.getByRole('button', { name: 'Rename' }).click();

    await expect(tree.getByText('new-name.md')).toBeVisible();
    await expect(tree.getByText('old-name.md')).toHaveCount(0);
  });

  test('deleting a file requires an explicit confirmation, and cancel leaves it untouched', async ({ page }) => {
    await page.addInitScript(installMockFileSystem, { 'keep-me.md': '# keep' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Folder…' }).click();

    const tree = page.getByRole('tree', { name: 'File explorer' });
    await tree.getByText('keep-me.md').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete' }).click();

    await expect(page.getByRole('alertdialog', { name: 'Delete' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(tree.getByText('keep-me.md')).toBeVisible();

    // Now actually confirm the delete.
    await tree.getByText('keep-me.md').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog', { name: 'Delete' }).getByRole('button', { name: 'Delete' }).click();

    await expect(tree.getByText('keep-me.md')).toHaveCount(0);
  });

  test('duplicates a file with a "<name> copy" filename and matching content', async ({ page }) => {
    await page.addInitScript(installMockFileSystem, { 'source.md': '# original content' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Folder…' }).click();

    const tree = page.getByRole('tree', { name: 'File explorer' });
    await tree.getByText('source.md').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Duplicate' }).click();

    await expect(tree.getByText('source copy.md')).toBeVisible();
    await tree.getByText('source copy.md').click();
    await expect(page.locator('.cm-content')).toContainText('original content');
  });
});
