import { InjectionToken } from '@angular/core';

export type EntryKind = 'file' | 'folder';

export interface TreeEntry {
  name: string;
  kind: EntryKind;
  handle: FileSystemHandle;
  path: string;
}

export interface FileReadResult {
  content: string;
  lastModified: number;
  isBinary: boolean;
}

export type FsMode = 'native' | 'fallback';

/**
 * Classified failure reasons surfaced to the UI (doc/specification.md
 * Reliability NFRs; Architecture.md §3, §8). Adapters map raw platform
 * errors onto these so the app never shows a bare stack trace to the user.
 */
export type FileSystemErrorCode =
  | 'permission-revoked'
  | 'not-found'
  | 'disk-full'
  | 'unknown';

export class FileSystemOperationError extends Error {
  constructor(
    public readonly code: FileSystemErrorCode,
    message: string,
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'FileSystemOperationError';
  }
}

/**
 * Single seam between the app and the real file system. Native and fallback
 * implementations both satisfy this; nothing above this layer may touch
 * platform file APIs directly (see Architecture.md §2.1, §7).
 */
export interface FileSystemAdapter {
  readonly mode: FsMode;

  openFolder(): Promise<FileSystemDirectoryHandle | null>;

  listChildren(folder: FileSystemDirectoryHandle): Promise<TreeEntry[]>;

  readFile(handle: FileSystemFileHandle): Promise<FileReadResult>;

  writeFile(handle: FileSystemFileHandle, content: string): Promise<void>;

  createFile(parent: FileSystemDirectoryHandle, name: string): Promise<FileSystemFileHandle>;

  createFolder(parent: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle>;

  rename(
    parent: FileSystemDirectoryHandle,
    handle: FileSystemHandle,
    newName: string
  ): Promise<FileSystemHandle>;

  duplicate(parent: FileSystemDirectoryHandle, handle: FileSystemFileHandle): Promise<FileSystemFileHandle>;

  remove(parent: FileSystemDirectoryHandle, handle: FileSystemHandle): Promise<void>;

  requestPersistedPermission(folder: FileSystemDirectoryHandle): Promise<PermissionState>;

  /** Query-only permission check (no prompt) — used to detect mid-session revocation before a save. */
  queryPermission(folder: FileSystemDirectoryHandle): Promise<PermissionState>;
}

export const FILE_SYSTEM_ADAPTER = new InjectionToken<FileSystemAdapter>('FILE_SYSTEM_ADAPTER');
