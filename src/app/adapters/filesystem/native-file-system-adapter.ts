import { Injectable } from '@angular/core';
import {
  FileReadResult,
  FileSystemAdapter,
  FileSystemErrorCode,
  FileSystemOperationError,
  FsMode,
  TreeEntry,
} from '../../core/file-system-adapter';

/**
 * Maps platform DOMException names to our classified error codes so the UI
 * never has to pattern-match raw browser error names (doc/specification.md
 * Reliability NFRs).
 */
function classifyError(err: unknown): FileSystemErrorCode {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'permission-revoked';
      case 'NotFoundError':
        return 'not-found';
      case 'QuotaExceededError':
        return 'disk-full';
      default:
        return 'unknown';
    }
  }
  return 'unknown';
}

function toOperationError(err: unknown, fallbackMessage: string): FileSystemOperationError {
  if (err instanceof FileSystemOperationError) return err;
  const code = classifyError(err);
  const messages: Record<FileSystemErrorCode, string> = {
    'permission-revoked': 'Access to this folder was revoked. Grant access again to continue.',
    'not-found': 'The file or its folder could not be found — it may have been moved or deleted.',
    'disk-full': 'The save failed because the disk appears to be full.',
    unknown: fallbackMessage,
  };
  return new FileSystemOperationError(code, messages[code], err);
}

const MARKDOWN_TEXT_EXTENSIONS = new Set(['md', 'markdown', 'txt']);

function isLikelyBinary(bytes: Uint8Array): boolean {
  // NUL bytes in the first slice are a strong binary signal; UTF-8 text
  // files never legitimately contain them.
  const sampleLength = Math.min(bytes.length, 8000);
  for (let i = 0; i < sampleLength; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}

function decodeUtf8Strict(bytes: Uint8Array): { text: string; isBinary: boolean } {
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return { text: decoder.decode(bytes), isBinary: false };
  } catch {
    return { text: '', isBinary: true };
  }
}

@Injectable({ providedIn: 'root' })
export class NativeFileSystemAdapter implements FileSystemAdapter {
  readonly mode: FsMode = 'native';

  async openFolder(): Promise<FileSystemDirectoryHandle | null> {
    try {
      return await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      throw err;
    }
  }

  async listChildren(folder: FileSystemDirectoryHandle): Promise<TreeEntry[]> {
    const entries: TreeEntry[] = [];
    for await (const [name, handle] of folder.entries()) {
      entries.push({
        name,
        kind: handle.kind === 'directory' ? 'folder' : 'file',
        handle,
        path: name,
      });
    }
    entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return entries;
  }

  async readFile(handle: FileSystemFileHandle): Promise<FileReadResult> {
    try {
      const file = await handle.getFile();
      const buffer = new Uint8Array(await file.arrayBuffer());

      if (isLikelyBinary(buffer)) {
        return { content: '', lastModified: file.lastModified, isBinary: true };
      }
      const { text, isBinary } = decodeUtf8Strict(buffer);
      return { content: text, lastModified: file.lastModified, isBinary };
    } catch (err) {
      throw toOperationError(err, 'Could not read the file.');
    }
  }

  async writeFile(handle: FileSystemFileHandle, content: string): Promise<void> {
    try {
      const writable = await handle.createWritable();
      try {
        await writable.write(content);
      } finally {
        await writable.close();
      }
    } catch (err) {
      throw toOperationError(err, 'Could not save the file.');
    }
  }

  async createFile(parent: FileSystemDirectoryHandle, name: string): Promise<FileSystemFileHandle> {
    return parent.getFileHandle(name, { create: true });
  }

  async createFolder(parent: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle> {
    return parent.getDirectoryHandle(name, { create: true });
  }

  async rename(
    parent: FileSystemDirectoryHandle,
    handle: FileSystemHandle,
    newName: string
  ): Promise<FileSystemHandle> {
    // The File System Access API has no atomic rename; emulate via
    // copy-then-delete. Folders are recursed; files use content copy.
    if (handle.kind === 'file') {
      const fileHandle = handle as FileSystemFileHandle;
      const { content } = await this.readFile(fileHandle);
      const newHandle = await this.createFile(parent, newName);
      await this.writeFile(newHandle, content);
      await parent.removeEntry(handle.name);
      return newHandle;
    }
    const dirHandle = handle as FileSystemDirectoryHandle;
    const newDir = await this.createFolder(parent, newName);
    await this.copyDirectoryContents(dirHandle, newDir);
    await parent.removeEntry(handle.name, { recursive: true });
    return newDir;
  }

  async duplicate(
    parent: FileSystemDirectoryHandle,
    handle: FileSystemFileHandle
  ): Promise<FileSystemFileHandle> {
    const { content } = await this.readFile(handle);
    const dupeName = this.nextAvailableName(handle.name);
    const newHandle = await this.createFile(parent, dupeName);
    await this.writeFile(newHandle, content);
    return newHandle;
  }

  async remove(parent: FileSystemDirectoryHandle, handle: FileSystemHandle): Promise<void> {
    await parent.removeEntry(handle.name, { recursive: handle.kind === 'directory' });
  }

  async requestPersistedPermission(folder: FileSystemDirectoryHandle): Promise<PermissionState> {
    const opts = { mode: 'readwrite' } as FileSystemHandlePermissionDescriptor;
    const existing = await folder.queryPermission(opts);
    if (existing === 'granted') return existing;
    return folder.requestPermission(opts);
  }

  async queryPermission(folder: FileSystemDirectoryHandle): Promise<PermissionState> {
    const opts = { mode: 'readwrite' } as FileSystemHandlePermissionDescriptor;
    return folder.queryPermission(opts);
  }

  private async copyDirectoryContents(
    source: FileSystemDirectoryHandle,
    dest: FileSystemDirectoryHandle
  ): Promise<void> {
    for await (const [name, child] of source.entries()) {
      if (child.kind === 'file') {
        const { content } = await this.readFile(child as FileSystemFileHandle);
        const newFile = await this.createFile(dest, name);
        await this.writeFile(newFile, content);
      } else {
        const newDir = await this.createFolder(dest, name);
        await this.copyDirectoryContents(child as FileSystemDirectoryHandle, newDir);
      }
    }
  }

  private nextAvailableName(originalName: string): string {
    const dotIndex = originalName.lastIndexOf('.');
    const base = dotIndex > 0 ? originalName.slice(0, dotIndex) : originalName;
    const ext = dotIndex > 0 ? originalName.slice(dotIndex) : '';
    return `${base} copy${ext}`;
  }
}

export function isMarkdownFile(name: string): boolean {
  return name.toLowerCase().endsWith('.md') || name.toLowerCase().endsWith('.markdown');
}

export function isSupportedTextFile(name: string): boolean {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return MARKDOWN_TEXT_EXTENSIONS.has(ext);
}
