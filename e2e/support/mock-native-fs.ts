/**
 * Installs an in-page mock of the File System Access API for Chromium E2E
 * specs. Playwright cannot script the OS-native folder picker, so this
 * overwrites `window.showDirectoryPicker` (via Page.addInitScript, before
 * the app bootstraps) with an in-memory implementation of
 * FileSystemFileHandle/FileSystemDirectoryHandle that the app's real
 * NativeFileSystemAdapter drives exactly as it would drive the real API —
 * see doc/Architecture.md §8. Firefox E2E specs do NOT use this; they
 * exercise the fallback adapter's real <input webkitdirectory> upload path
 * instead, since Firefox genuinely lacks showDirectoryPicker.
 *
 * This function's body is serialized and run inside the browser by
 * Playwright (`page.addInitScript(installMockFileSystem, tree)`) — it must
 * be self-contained, no references to anything outside its own parameters.
 */
export type MockFsTree = { [name: string]: string | MockFsTree };

export function installMockFileSystem(tree: MockFsTree): void {
  class MockWritable {
    private buffer: string;
    constructor(private readonly handle: MockFileHandle) {
      this.buffer = handle.content;
    }
    async write(data: string): Promise<void> {
      this.buffer = data;
    }
    async close(): Promise<void> {
      this.handle.content = this.buffer;
      this.handle.lastModified = Date.now();
    }
  }

  class MockFileHandle {
    readonly kind = 'file' as const;
    lastModified = Date.now();
    constructor(
      public name: string,
      public content: string
    ) {}
    async getFile(): Promise<File> {
      return new File([this.content], this.name, { lastModified: this.lastModified });
    }
    async createWritable(): Promise<MockWritable> {
      return new MockWritable(this);
    }
    async queryPermission(): Promise<PermissionState> {
      return 'granted';
    }
    async requestPermission(): Promise<PermissionState> {
      return 'granted';
    }
    isSameEntry(other: unknown): boolean {
      return other === this;
    }
  }

  class MockDirectoryHandle {
    readonly kind = 'directory' as const;
    constructor(
      public name: string,
      public children: Map<string, MockFileHandle | MockDirectoryHandle>
    ) {}
    async *entries(): AsyncGenerator<[string, MockFileHandle | MockDirectoryHandle]> {
      for (const entry of this.children) yield entry;
    }
    async getFileHandle(name: string, opts?: { create?: boolean }): Promise<MockFileHandle> {
      const existing = this.children.get(name);
      if (existing) return existing as MockFileHandle;
      if (!opts?.create) throw new DOMException('Not found', 'NotFoundError');
      const created = new MockFileHandle(name, '');
      this.children.set(name, created);
      return created;
    }
    async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<MockDirectoryHandle> {
      const existing = this.children.get(name);
      if (existing) return existing as MockDirectoryHandle;
      if (!opts?.create) throw new DOMException('Not found', 'NotFoundError');
      const created = new MockDirectoryHandle(name, new Map());
      this.children.set(name, created);
      return created;
    }
    async removeEntry(name: string): Promise<void> {
      this.children.delete(name);
    }
    async queryPermission(): Promise<PermissionState> {
      return 'granted';
    }
    async requestPermission(): Promise<PermissionState> {
      return 'granted';
    }
    isSameEntry(other: unknown): boolean {
      return other === this;
    }
  }

  function buildTree(name: string, spec: MockFsTree): MockDirectoryHandle {
    const children = new Map<string, MockFileHandle | MockDirectoryHandle>();
    for (const key of Object.keys(spec)) {
      const value = spec[key];
      children.set(key, typeof value === 'string' ? new MockFileHandle(key, value) : buildTree(key, value));
    }
    return new MockDirectoryHandle(name, children);
  }

  const root = buildTree('root', tree);
  (window as unknown as { showDirectoryPicker: () => Promise<MockDirectoryHandle> }).showDirectoryPicker =
    async () => root;
  (window as unknown as { __mockFsRoot: MockDirectoryHandle }).__mockFsRoot = root;
}
