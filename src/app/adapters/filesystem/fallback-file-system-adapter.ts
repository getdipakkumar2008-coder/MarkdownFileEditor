import { Injectable } from '@angular/core';
import {
  FileReadResult,
  FileSystemAdapter,
  FsMode,
  TreeEntry,
} from '../../core/file-system-adapter';
import { VirtualDirectoryHandle, VirtualFileHandle, isVirtualDirectory, isVirtualFile } from './virtual-handles';

function isLikelyBinary(bytes: Uint8Array): boolean {
  const sampleLength = Math.min(bytes.length, 8000);
  for (let i = 0; i < sampleLength; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}

function decodeUtf8Strict(bytes: Uint8Array): { text: string; isBinary: boolean } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), isBinary: false };
  } catch {
    return { text: '', isBinary: true };
  }
}

function triggerDownload(name: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Non-Chromium fallback (Firefox/Safari): upload via <input type="file"
 * webkitdirectory> into an in-memory virtual tree, and "save" downloads the
 * modified file rather than overwriting anything in place — there is no
 * platform API for that outside Chromium. This is a permanent, first-class
 * mode (not a stopgap) per doc/specification.md — the toolbar always shows
 * which mode is active.
 */
@Injectable({ providedIn: 'root' })
export class FallbackFileSystemAdapter implements FileSystemAdapter {
  readonly mode: FsMode = 'fallback';

  async openFolder(): Promise<FileSystemDirectoryHandle | null> {
    const files = await this.pickFolder();
    if (!files || files.length === 0) return null;
    return this.buildTree(files) as unknown as FileSystemDirectoryHandle;
  }

  async listChildren(folder: FileSystemDirectoryHandle): Promise<TreeEntry[]> {
    const vFolder = folder as unknown as VirtualDirectoryHandle;
    const entries: TreeEntry[] = [];
    for (const [name, handle] of vFolder.children) {
      entries.push({
        name,
        kind: isVirtualDirectory(handle) ? 'folder' : 'file',
        handle: handle as unknown as FileSystemHandle,
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
    const vHandle = handle as unknown as VirtualFileHandle;

    if (vHandle.content !== null) {
      return { content: vHandle.content, lastModified: vHandle.lastModified, isBinary: false };
    }
    if (!vHandle.sourceFile) {
      // Newly created, never-written file.
      return { content: '', lastModified: vHandle.lastModified, isBinary: false };
    }
    const buffer = new Uint8Array(await vHandle.sourceFile.arrayBuffer());
    if (isLikelyBinary(buffer)) {
      return { content: '', lastModified: vHandle.lastModified, isBinary: true };
    }
    const { text, isBinary } = decodeUtf8Strict(buffer);
    if (!isBinary) vHandle.content = text; // cache so repeat reads don't re-decode
    return { content: text, lastModified: vHandle.lastModified, isBinary };
  }

  async writeFile(handle: FileSystemFileHandle, content: string): Promise<void> {
    const vHandle = handle as unknown as VirtualFileHandle;
    vHandle.content = content;
    vHandle.lastModified = Date.now();
    triggerDownload(vHandle.name, content);
  }

  async createFile(parent: FileSystemDirectoryHandle, name: string): Promise<FileSystemFileHandle> {
    const vParent = parent as unknown as VirtualDirectoryHandle;
    const handle = new VirtualFileHandle(name, null, '');
    vParent.children.set(name, handle);
    return handle as unknown as FileSystemFileHandle;
  }

  async createFolder(parent: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle> {
    const vParent = parent as unknown as VirtualDirectoryHandle;
    const handle = new VirtualDirectoryHandle(name);
    vParent.children.set(name, handle);
    return handle as unknown as FileSystemDirectoryHandle;
  }

  async rename(
    parent: FileSystemDirectoryHandle,
    handle: FileSystemHandle,
    newName: string
  ): Promise<FileSystemHandle> {
    const vParent = parent as unknown as VirtualDirectoryHandle;
    const vHandle = handle as unknown as VirtualFileHandle | VirtualDirectoryHandle;
    vParent.children.delete(vHandle.name);
    vHandle.name = newName;
    vParent.children.set(newName, vHandle);
    return vHandle as unknown as FileSystemHandle;
  }

  async duplicate(
    parent: FileSystemDirectoryHandle,
    handle: FileSystemFileHandle
  ): Promise<FileSystemFileHandle> {
    const vParent = parent as unknown as VirtualDirectoryHandle;
    const vHandle = handle as unknown as VirtualFileHandle;
    const { content } = await this.readFile(handle);
    const dupeName = this.nextAvailableName(vHandle.name, vParent);
    const dupe = new VirtualFileHandle(dupeName, null, content);
    vParent.children.set(dupeName, dupe);
    return dupe as unknown as FileSystemFileHandle;
  }

  async remove(parent: FileSystemDirectoryHandle, handle: FileSystemHandle): Promise<void> {
    const vParent = parent as unknown as VirtualDirectoryHandle;
    const vHandle = handle as unknown as VirtualFileHandle | VirtualDirectoryHandle;
    vParent.children.delete(vHandle.name);
  }

  async requestPersistedPermission(): Promise<PermissionState> {
    // Fallback mode has no platform permission model — nothing to persist.
    return 'granted';
  }

  async queryPermission(): Promise<PermissionState> {
    return 'granted';
  }

  private pickFolder(): Promise<FileList | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');
      input.multiple = true;
      input.style.display = 'none';

      input.addEventListener(
        'change',
        () => {
          resolve(input.files);
          input.remove();
        },
        { once: true }
      );
      // No AbortError signal exists for <input type=file> cancellation; a
      // cancelled picker simply never fires 'change' and the caller's
      // openWorkspace() call stays pending until the user tries again.
      document.body.appendChild(input);
      input.click();
    });
  }

  private buildTree(files: FileList): VirtualDirectoryHandle {
    const root = new VirtualDirectoryHandle('root');
    for (const file of Array.from(files)) {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const allSegments = relativePath.split('/').filter(Boolean);
      // webkitRelativePath always includes the PICKED folder's own name as
      // the first segment (e.g. "my-folder/notes.md"). Native mode's
      // showDirectoryPicker returns a handle FOR the picked folder, so its
      // direct children land at the tree root with no such wrapper — strip
      // that first segment here so fallback mode's root matches native
      // mode's root instead of nesting everything one level deeper.
      const segments = allSegments.length > 1 ? allSegments.slice(1) : allSegments;
      let cursor = root;
      for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i];
        let next = cursor.children.get(segment);
        if (!next || !isVirtualDirectory(next)) {
          next = new VirtualDirectoryHandle(segment);
          cursor.children.set(segment, next);
        }
        cursor = next;
      }
      const fileName = segments[segments.length - 1];
      cursor.children.set(fileName, new VirtualFileHandle(fileName, file));
    }
    return root;
  }

  private nextAvailableName(originalName: string, parent: VirtualDirectoryHandle): string {
    const dotIndex = originalName.lastIndexOf('.');
    const base = dotIndex > 0 ? originalName.slice(0, dotIndex) : originalName;
    const ext = dotIndex > 0 ? originalName.slice(dotIndex) : '';
    let candidate = `${base} copy${ext}`;
    let suffix = 2;
    while (parent.children.has(candidate)) {
      candidate = `${base} copy ${suffix}${ext}`;
      suffix++;
    }
    return candidate;
  }
}
