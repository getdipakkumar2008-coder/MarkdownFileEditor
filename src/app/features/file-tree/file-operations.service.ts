import { Inject, Injectable } from '@angular/core';
import {
  FILE_SYSTEM_ADAPTER,
  FileSystemAdapter,
  FileSystemOperationError,
  TreeEntry,
} from '../../core/file-system-adapter';
import { BACKUP_STORE, BackupStore } from '../../core/backup-store';
import { ERROR_REPORTER, ErrorReporter } from '../../core/error-reporter';
import { isSupportedTextFile } from '../../adapters/filesystem/native-file-system-adapter';
import { OpenFile, WorkspaceState } from '../../state/workspace-state';

/**
 * FR-1, FR-5, FR-7 (doc/specification.md §3.1–3.2): open a folder, open a
 * file, save in place. No platform File System API call happens outside
 * `adapter` — everything here goes through the FileSystemAdapter interface.
 */
@Injectable({ providedIn: 'root' })
export class FileOperationsService {
  constructor(
    @Inject(FILE_SYSTEM_ADAPTER) private readonly adapter: FileSystemAdapter,
    @Inject(BACKUP_STORE) private readonly backupStore: BackupStore,
    @Inject(ERROR_REPORTER) private readonly errorReporter: ErrorReporter,
    private readonly state: WorkspaceState
  ) {}

  async openWorkspace(): Promise<void> {
    const root = await this.adapter.openFolder();
    if (!root) return; // user cancelled the picker

    await this.adapter.requestPersistedPermission(root);
    const tree = await this.adapter.listChildren(root);
    this.state.setWorkspace(root, tree);
  }

  async openFile(handle: FileSystemFileHandle, path: string): Promise<void> {
    const result = await this.adapter.readFile(handle);

    const openFile: OpenFile = {
      handle,
      path,
      content: result.isBinary ? '' : result.content,
      dirty: false,
      saveState: 'saved',
      saveError: null,
      saveErrorCode: null,
      lastKnownDiskMtime: result.lastModified,
      isMarkdown: isSupportedTextFile(handle.name) && handle.name.toLowerCase().match(/\.(md|markdown)$/) !== null,
      isBinary: result.isBinary,
    };
    this.state.setOpenFile(openFile);
    this.state.pendingRecovery.set(null);

    // FR-13: offer recovery only when the backup is strictly newer than the
    // on-disk save — never auto-apply it.
    if (!result.isBinary) {
      const backup = await this.backupStore.get(path);
      if (backup && backup.savedAt > result.lastModified && backup.content !== result.content) {
        this.state.pendingRecovery.set(backup);
      }
    }
  }

  /** User chose to restore the IndexedDB backup over the on-disk content. */
  applyRecovery(): void {
    const backup = this.state.pendingRecovery();
    const file = this.state.openFile();
    if (!backup || !file || file.path !== backup.path) return;
    this.state.updateContent(backup.content);
    this.state.pendingRecovery.set(null);
  }

  /** User chose to keep the on-disk content and discard the stale backup. */
  async discardRecovery(): Promise<void> {
    const backup = this.state.pendingRecovery();
    this.state.pendingRecovery.set(null);
    if (backup) {
      await this.backupStore.remove(backup.path);
    }
  }

  /**
   * Save writes to the ORIGINAL handle in place — never a new-file download
   * in native mode (CLAUDE.md rule 3). Refuses to overwrite silently if the
   * file changed on disk since it was opened (external-modification guard,
   * Architecture.md §3) — caller must explicitly force or reload.
   *
   * Order of checks matters for the UX: a revoked permission is checked
   * first, since that's the only case where re-reading the file to check
   * its mtime would itself fail with a confusing error.
   */
  async save(force = false): Promise<void> {
    const file = this.state.openFile();
    const root = this.state.rootHandle();
    if (!file) return;

    this.state.markSaving();

    if (root) {
      const permission = await this.adapter.queryPermission(root);
      if (permission !== 'granted') {
        this.state.markError(
          'Access to this folder was revoked. Grant access again to keep saving.',
          'permission-revoked'
        );
        return;
      }
    }

    try {
      if (!force) {
        const onDisk = await this.adapter.readFile(file.handle);
        if (onDisk.lastModified > file.lastKnownDiskMtime) {
          this.state.markError(
            'This file changed on disk since it was opened. Overwrite anyway, or reload to see the new version.',
            'external-modification'
          );
          return;
        }
      }
      await this.adapter.writeFile(file.handle, file.content);
      const after = await this.adapter.readFile(file.handle);
      this.state.markSaved(after.lastModified);
      // Keep the backup in step with a successful disk save so a later open
      // doesn't offer a stale recovery prompt for content already on disk.
      await this.backupStore.put({ path: file.path, content: file.content, savedAt: after.lastModified });
    } catch (err) {
      const code = err instanceof FileSystemOperationError ? err.code : 'unknown';
      const message = err instanceof Error ? err.message : 'Unknown error while saving.';
      this.state.markError(message, code);
      // Metadata is code + operation only — never file.path or file.content
      // (CLAUDE.md rule 1, Architecture.md §2.4).
      this.errorReporter.report(err, { code, operation: 'save' });
      // Disk write failed — this is exactly the case the IndexedDB backup
      // exists for, so still record it even though the disk write did not succeed.
      await this.backupStore
        .put({ path: file.path, content: file.content, savedAt: Date.now() })
        .catch(() => undefined);
    }
  }

  /** UI action for the external-modification conflict dialog: overwrite disk despite the newer mtime. */
  async overwriteAnyway(): Promise<void> {
    await this.save(true);
  }

  /** UI action for the external-modification conflict dialog: discard local edits, load what's on disk. */
  async reloadFromDisk(): Promise<void> {
    const file = this.state.openFile();
    if (!file) return;
    await this.openFile(file.handle, file.path);
  }

  /** UI action for the permission-revoked dialog: re-prompt for folder access, then retry the save. */
  async regrantPermissionAndRetry(): Promise<void> {
    const root = this.state.rootHandle();
    if (!root) return;
    const result = await this.adapter.requestPersistedPermission(root);
    if (result === 'granted') {
      await this.save();
    } else {
      this.state.markError('Folder access is still not granted — saving is disabled until it is.', 'permission-revoked');
    }
  }

  /** Re-fetches one folder's children — root (parentPath null) or a lazily-expanded nested folder. */
  async refreshChildrenAt(parentPath: string | null, parentHandle: FileSystemDirectoryHandle): Promise<void> {
    const root = this.state.rootHandle();
    if (!root) return;
    try {
      const entries = await this.adapter.listChildren(parentHandle);
      if (parentPath === null) {
        this.state.tree.set(entries);
      } else {
        this.state.setChildren(parentPath, entries);
      }
    } catch (err) {
      const code = err instanceof FileSystemOperationError ? err.code : 'unknown';
      if (code === 'not-found' && parentPath === null) {
        // The opened root folder itself was moved/deleted — nothing left to browse.
        this.state.setWorkspace(root, []);
        return;
      }
      this.errorReporter.report(err, { code, operation: 'list-children' });
      throw err;
    }
  }

  /** Expand/collapse a folder row, lazily loading its children the first time it's expanded (FR-1: don't eagerly read the whole tree). */
  async toggleFolder(entry: TreeEntry, fullPath: string): Promise<void> {
    const isExpanding = !this.state.expandedPaths().has(fullPath);
    if (isExpanding && !this.state.childrenCache().has(fullPath)) {
      await this.refreshChildrenAt(fullPath, entry.handle as FileSystemDirectoryHandle);
    }
    this.state.toggleExpanded(fullPath);
  }

  async createFile(parentHandle: FileSystemDirectoryHandle, parentPath: string | null, name: string): Promise<void> {
    await this.adapter.createFile(parentHandle, name);
    await this.refreshChildrenAt(parentPath, parentHandle);
  }

  async createFolder(parentHandle: FileSystemDirectoryHandle, parentPath: string | null, name: string): Promise<void> {
    await this.adapter.createFolder(parentHandle, name);
    await this.refreshChildrenAt(parentPath, parentHandle);
  }

  async rename(
    parentHandle: FileSystemDirectoryHandle,
    parentPath: string | null,
    handle: FileSystemHandle,
    fullPath: string,
    newName: string
  ): Promise<void> {
    await this.adapter.rename(parentHandle, handle, newName);
    if (handle.kind === 'directory') {
      // Old path is stale either way — collapse rather than try to rekey a nested cache.
      this.state.collapseSubtree(fullPath);
    }
    await this.refreshChildrenAt(parentPath, parentHandle);
  }

  async duplicate(
    parentHandle: FileSystemDirectoryHandle,
    parentPath: string | null,
    handle: FileSystemFileHandle
  ): Promise<void> {
    await this.adapter.duplicate(parentHandle, handle);
    await this.refreshChildrenAt(parentPath, parentHandle);
  }

  /** Caller is responsible for the confirm dialog (CLAUDE.md rule 5) — this performs the delete only. */
  async remove(
    parentHandle: FileSystemDirectoryHandle,
    parentPath: string | null,
    handle: FileSystemHandle,
    fullPath: string
  ): Promise<void> {
    await this.adapter.remove(parentHandle, handle);
    if (handle.kind === 'directory') {
      this.state.collapseSubtree(fullPath);
    }
    if (this.state.openFile()?.handle === handle) {
      this.state.setOpenFile(null);
    }
    await this.refreshChildrenAt(parentPath, parentHandle);
  }
}
