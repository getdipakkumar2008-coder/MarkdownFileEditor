import { TreeEntry } from '../../core/file-system-adapter';

export interface TreeRow {
  entry: TreeEntry;
  depth: number;
  /** Full path from the workspace root, e.g. "docs/notes.md". */
  fullPath: string;
  parentHandle: FileSystemDirectoryHandle;
  /** null for a root-level row. */
  parentPath: string | null;
  expanded: boolean;
}

/**
 * Pure projection from (root entries + expansion state + lazy-loaded
 * children) to the flat row list the virtualized viewport renders — kept
 * side-effect-free so it's cheap to unit test independent of Angular
 * (FR-1, doc/specification.md §3.1: virtualize, don't render the full tree).
 */
export function flattenTree(
  root: TreeEntry[],
  rootHandle: FileSystemDirectoryHandle,
  expandedPaths: ReadonlySet<string>,
  childrenCache: ReadonlyMap<string, TreeEntry[]>
): TreeRow[] {
  const rows: TreeRow[] = [];

  function walk(entries: TreeEntry[], depth: number, parentHandle: FileSystemDirectoryHandle, parentPath: string | null) {
    for (const entry of entries) {
      const fullPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
      const expanded = entry.kind === 'folder' && expandedPaths.has(fullPath);
      rows.push({ entry, depth, fullPath, parentHandle, parentPath, expanded });
      if (expanded) {
        const children = childrenCache.get(fullPath) ?? [];
        walk(children, depth + 1, entry.handle as FileSystemDirectoryHandle, fullPath);
      }
    }
  }

  walk(root, 0, rootHandle, null);
  return rows;
}
