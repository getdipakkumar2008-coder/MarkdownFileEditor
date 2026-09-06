/**
 * Structural stand-ins for FileSystemFileHandle/FileSystemDirectoryHandle in
 * fallback mode, where there is no real platform handle. Cast to the DOM
 * type at the FileSystemAdapter boundary (FallbackFileSystemAdapter is the
 * only place that does this) — the rest of the app treats handles as opaque
 * tokens it passes back into the adapter, never calling DOM handle methods
 * directly (Architecture.md §2.1, §7).
 */

export class VirtualFileHandle {
  readonly kind = 'file' as const;

  constructor(
    public name: string,
    /** Original uploaded blob, if this file came from the folder picker. */
    public sourceFile: File | null,
    /** In-memory content once read or edited during the session. */
    public content: string | null = null,
    public lastModified: number = Date.now()
  ) {}

  isSameEntry(other: unknown): boolean {
    return other === this;
  }
}

export class VirtualDirectoryHandle {
  readonly kind = 'directory' as const;
  readonly children = new Map<string, VirtualFileHandle | VirtualDirectoryHandle>();

  constructor(public name: string) {}

  isSameEntry(other: unknown): boolean {
    return other === this;
  }
}

export function isVirtualFile(handle: unknown): handle is VirtualFileHandle {
  return handle instanceof VirtualFileHandle;
}

export function isVirtualDirectory(handle: unknown): handle is VirtualDirectoryHandle {
  return handle instanceof VirtualDirectoryHandle;
}
