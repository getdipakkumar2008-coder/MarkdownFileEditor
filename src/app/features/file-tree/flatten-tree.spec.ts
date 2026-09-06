import { flattenTree } from './flatten-tree';
import { TreeEntry } from '../../core/file-system-adapter';

function fileEntry(name: string): TreeEntry {
  return { name, kind: 'file', handle: { kind: 'file', name } as FileSystemHandle, path: name };
}

function folderEntry(name: string): TreeEntry {
  return { name, kind: 'folder', handle: { kind: 'directory', name } as FileSystemHandle, path: name };
}

const rootHandle = {} as FileSystemDirectoryHandle;

describe('flattenTree', () => {
  it('returns root entries at depth 0 with no expansion', () => {
    const root = [folderEntry('docs'), fileEntry('readme.md')];
    const rows = flattenTree(root, rootHandle, new Set(), new Map());
    expect(rows.map((r) => r.fullPath)).toEqual(['docs', 'readme.md']);
    expect(rows.every((r) => r.depth === 0)).toBe(true);
    expect(rows[0].expanded).toBe(false);
  });

  it('inlines a folder\'s cached children immediately after it when expanded', () => {
    const root = [folderEntry('docs'), fileEntry('readme.md')];
    const cache = new Map([['docs', [fileEntry('a.md'), fileEntry('b.md')]]]);
    const rows = flattenTree(root, rootHandle, new Set(['docs']), cache);
    expect(rows.map((r) => r.fullPath)).toEqual(['docs', 'docs/a.md', 'docs/b.md', 'readme.md']);
    expect(rows[1].depth).toBe(1);
    expect(rows[1].parentPath).toBe('docs');
  });

  it('does not recurse into a folder that is expanded but has no cached children yet', () => {
    const root = [folderEntry('docs')];
    const rows = flattenTree(root, rootHandle, new Set(['docs']), new Map());
    expect(rows).toHaveLength(1);
    expect(rows[0].expanded).toBe(true);
  });

  it('recurses through nested expanded folders', () => {
    const root = [folderEntry('a')];
    const cache = new Map([
      ['a', [folderEntry('b')]],
      ['a/b', [fileEntry('c.md')]],
    ]);
    const rows = flattenTree(root, rootHandle, new Set(['a', 'a/b']), cache);
    expect(rows.map((r) => r.fullPath)).toEqual(['a', 'a/b', 'a/b/c.md']);
    expect(rows[2].depth).toBe(2);
  });

  it('a collapsed folder does not show its cached children even if present', () => {
    const root = [folderEntry('docs')];
    const cache = new Map([['docs', [fileEntry('a.md')]]]);
    const rows = flattenTree(root, rootHandle, new Set(), cache);
    expect(rows).toHaveLength(1);
  });
});
