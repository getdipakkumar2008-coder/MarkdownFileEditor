import { Inject, Injectable, signal, computed } from '@angular/core';
import { FILE_SYSTEM_ADAPTER, FileSystemAdapter, FsMode, TreeEntry } from '../core/file-system-adapter';
import { BackupRecord } from '../core/backup-store';

export type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

/**
 * Classified reasons a save can fail, used to drive which recovery UX shows
 * (doc/specification.md Reliability NFRs). 'external-modification' is
 * detected in FileOperationsService itself (mtime comparison), the rest
 * come from FileSystemOperationError raised by the adapter.
 */
export type SaveErrorCode =
  | 'external-modification'
  | 'permission-revoked'
  | 'not-found'
  | 'disk-full'
  | 'unknown';

export interface OpenFile {
  handle: FileSystemFileHandle;
  path: string;
  content: string;
  dirty: boolean;
  saveState: SaveState;
  saveError: string | null;
  saveErrorCode: SaveErrorCode | null;
  lastKnownDiskMtime: number;
  isMarkdown: boolean;
  isBinary: boolean;
}

/**
 * Per-session workspace state (Architecture.md §3). No global singleton
 * beyond this DI-scoped, per-app-instance store — kept swappable for a
 * future per-user session wrapper (Architecture.md §9).
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceState {
  readonly rootHandle = signal<FileSystemDirectoryHandle | null>(null);
  readonly mode: FsMode;
  readonly tree = signal<TreeEntry[]>([]);
  readonly openFile = signal<OpenFile | null>(null);

  /** Full folder paths ('a/b/c') currently expanded in the tree UI. */
  readonly expandedPaths = signal<ReadonlySet<string>>(new Set());
  /** Lazily-loaded children for expanded folders, keyed by full folder path (Architecture.md §5). */
  readonly childrenCache = signal<ReadonlyMap<string, TreeEntry[]>>(new Map());

  constructor(@Inject(FILE_SYSTEM_ADAPTER) adapter: FileSystemAdapter) {
    this.mode = adapter.mode;
  }

  /**
   * Set when a file is opened and IndexedDB holds a backup newer than the
   * on-disk save (FR-13). The UI must prompt, never silently apply it.
   */
  readonly pendingRecovery = signal<BackupRecord | null>(null);

  readonly hasWorkspace = computed(() => this.rootHandle() !== null);
  readonly saveState = computed<SaveState>(() => this.openFile()?.saveState ?? 'saved');

  setWorkspace(root: FileSystemDirectoryHandle, tree: TreeEntry[]): void {
    this.rootHandle.set(root);
    this.tree.set(tree);
    this.expandedPaths.set(new Set());
    this.childrenCache.set(new Map());
  }

  setChildren(folderPath: string, entries: TreeEntry[]): void {
    const next = new Map(this.childrenCache());
    next.set(folderPath, entries);
    this.childrenCache.set(next);
  }

  toggleExpanded(folderPath: string): void {
    const next = new Set(this.expandedPaths());
    if (next.has(folderPath)) {
      next.delete(folderPath);
    } else {
      next.add(folderPath);
    }
    this.expandedPaths.set(next);
  }

  /** Drops a folder (and anything nested under it) from expansion/cache — used after rename/delete of a folder. */
  collapseSubtree(folderPath: string): void {
    const prefix = `${folderPath}/`;
    const nextExpanded = new Set([...this.expandedPaths()].filter((p) => p !== folderPath && !p.startsWith(prefix)));
    const nextCache = new Map(
      [...this.childrenCache()].filter(([p]) => p !== folderPath && !p.startsWith(prefix))
    );
    this.expandedPaths.set(nextExpanded);
    this.childrenCache.set(nextCache);
  }

  setOpenFile(file: OpenFile | null): void {
    this.openFile.set(file);
  }

  updateContent(content: string): void {
    const current = this.openFile();
    if (!current) return;
    this.openFile.set({ ...current, content, dirty: true, saveState: 'unsaved' });
  }

  markSaving(): void {
    const current = this.openFile();
    if (!current) return;
    this.openFile.set({ ...current, saveState: 'saving' });
  }

  markSaved(mtime: number): void {
    const current = this.openFile();
    if (!current) return;
    this.openFile.set({
      ...current,
      dirty: false,
      saveState: 'saved',
      saveError: null,
      saveErrorCode: null,
      lastKnownDiskMtime: mtime,
    });
  }

  markError(reason: string, code: SaveErrorCode = 'unknown'): void {
    const current = this.openFile();
    if (!current) return;
    this.openFile.set({ ...current, saveState: 'error', saveError: reason, saveErrorCode: code });
  }
}
