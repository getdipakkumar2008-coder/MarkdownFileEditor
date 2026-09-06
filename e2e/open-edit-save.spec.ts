import { test, expect } from '@playwright/test';
import { installMockFileSystem } from './support/mock-native-fs';

// US-1, US-2, US-4 (doc/specification.md §2): open a folder, see the tree,
// open a .md file, edit it, save it — verified against the mock's own
// in-memory file content, not just the UI state.
test('open a folder, open a file, edit it, save with Ctrl+S, and see the write land on the mock disk', async ({
  page,
}) => {
  await page.addInitScript(installMockFileSystem, {
    'notes.md': '# Hello',
    'readme.txt': 'plain text',
  });
  await page.goto('/');

  await page.getByRole('button', { name: 'Open Folder…' }).click();

  const tree = page.getByRole('tree', { name: 'File explorer' });
  await expect(tree.getByText('notes.md')).toBeVisible();
  await expect(tree.getByText('readme.txt')).toBeVisible();

  await tree.getByText('notes.md').click();

  const editorContent = page.locator('.cm-content');
  await expect(editorContent).toContainText('# Hello');

  await editorContent.click();
  await page.keyboard.press('End');
  await page.keyboard.type('\n\nMore content.');

  await expect(page.getByRole('status')).toHaveText('Unsaved changes');

  await page.keyboard.press('Control+s');

  await expect(page.getByRole('status')).toHaveText('Saved');

  const savedContent = await page.evaluate(() => {
    const root = (window as unknown as { __mockFsRoot: { children: Map<string, { content?: string }> } })
      .__mockFsRoot;
    return root.children.get('notes.md')?.content;
  });
  expect(savedContent).toContain('# Hello');
  expect(savedContent).toContain('More content.');
});

test('preview pane renders only for markdown files, not plain text', async ({ page }) => {
  await page.addInitScript(installMockFileSystem, {
    'notes.md': '# Title',
    'readme.txt': 'plain text',
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Folder…' }).click();

  const tree = page.getByRole('tree', { name: 'File explorer' });

  await tree.getByText('notes.md').click();
  await expect(page.getByLabel('Markdown preview')).toBeVisible();

  await tree.getByText('readme.txt').click();
  await expect(page.getByLabel('Markdown preview')).toHaveCount(0);
});
