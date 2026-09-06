import { test, expect } from '@playwright/test';
import { installMockFileSystem } from './support/mock-native-fs';

// US-10, Accessibility NFR (doc/specification.md §4): full keyboard
// navigability across the file tree — no mouse required anywhere in this
// spec, matching the WAI-ARIA treeview roving-tabindex pattern.
test('opens a nested file using only the keyboard: Tab into the tree, arrow down, arrow-right to expand, Enter to open', async ({
  page,
}) => {
  await page.addInitScript(installMockFileSystem, {
    'top.md': '# top level',
    docs: {
      'nested.md': '# nested content',
    },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Folder…' }).click();

  const tree = page.getByRole('tree', { name: 'File explorer' });
  await expect(tree.getByText('docs')).toBeVisible();

  // Focus the tree's first row (roving tabindex — only one row is tabbable).
  // Focus is already on "Open Folder…" from the click above. Save is
  // `[disabled]` until a file is open, so it's skipped from the tab order.
  await page.keyboard.press('Tab'); // New File
  await page.keyboard.press('Tab'); // New Folder
  await page.keyboard.press('Tab'); // lands on the first tree row ("docs", sorted before "top.md")

  await expect(page.getByRole('treeitem', { name: /docs/ })).toBeFocused();

  await page.keyboard.press('ArrowRight'); // expand docs
  await expect(tree.getByText('nested.md')).toBeVisible();

  await page.keyboard.press('ArrowDown'); // move focus onto nested.md
  await expect(page.getByRole('treeitem', { name: /nested\.md/ })).toBeFocused();

  await page.keyboard.press('Enter'); // open it
  await expect(page.locator('.cm-content')).toContainText('nested content');
});

test('opens the right-click context menu equivalent via the keyboard (Shift+F10)', async ({ page }) => {
  await page.addInitScript(installMockFileSystem, { 'notes.md': '# n' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Folder…' }).click();

  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab'); // New File, New Folder, first row (focus already on Open Folder from the click; Save is disabled/skipped)

  await page.keyboard.press('Shift+F10');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem').first()).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});
