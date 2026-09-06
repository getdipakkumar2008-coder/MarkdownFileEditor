import { FallbackFileSystemAdapter } from './fallback-file-system-adapter';
import { VirtualDirectoryHandle, VirtualFileHandle } from './virtual-handles';

function makeFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/plain' });
}

describe('FallbackFileSystemAdapter', () => {
  let adapter: FallbackFileSystemAdapter;

  beforeEach(() => {
    adapter = new FallbackFileSystemAdapter();
  });

  it('reports fallback mode', () => {
    expect(adapter.mode).toBe('fallback');
  });

  it('reads UTF-8 text content from a virtual file backed by a real File', async () => {
    const handle = new VirtualFileHandle('notes.md', makeFile('notes.md', '# Hello'));
    const result = await adapter.readFile(handle as unknown as FileSystemFileHandle);
    expect(result.isBinary).toBe(false);
    expect(result.content).toBe('# Hello');
  });

  it('detects binary content via NUL-byte sniffing', async () => {
    const binaryBytes = new Uint8Array([0x00, 0x01, 0x02, 0xff]);
    const file = new File([binaryBytes], 'image.bin');
    const handle = new VirtualFileHandle('image.bin', file);
    const result = await adapter.readFile(handle as unknown as FileSystemFileHandle);
    expect(result.isBinary).toBe(true);
  });

  it('createFile then writeFile stores content in memory without a source File', async () => {
    const parent = new VirtualDirectoryHandle('root');
    const handle = await adapter.createFile(parent as unknown as FileSystemDirectoryHandle, 'new.md');
    await adapter.writeFile(handle, '# New');
    const result = await adapter.readFile(handle);
    expect(result.content).toBe('# New');
  });

  it('createFolder + listChildren reflects the virtual tree, folders sorted before files', async () => {
    const parent = new VirtualDirectoryHandle('root');
    await adapter.createFile(parent as unknown as FileSystemDirectoryHandle, 'b.md');
    await adapter.createFolder(parent as unknown as FileSystemDirectoryHandle, 'a-folder');
    const entries = await adapter.listChildren(parent as unknown as FileSystemDirectoryHandle);
    expect(entries.map((e) => e.name)).toEqual(['a-folder', 'b.md']);
    expect(entries[0].kind).toBe('folder');
  });

  it('rename updates the handle name and the parent map key', async () => {
    const parent = new VirtualDirectoryHandle('root');
    const handle = await adapter.createFile(parent as unknown as FileSystemDirectoryHandle, 'old.md');
    await adapter.rename(parent as unknown as FileSystemDirectoryHandle, handle, 'new.md');
    const entries = await adapter.listChildren(parent as unknown as FileSystemDirectoryHandle);
    expect(entries.map((e) => e.name)).toEqual(['new.md']);
  });

  it('duplicate copies content under a "<name> copy" filename', async () => {
    const parent = new VirtualDirectoryHandle('root');
    const handle = await adapter.createFile(parent as unknown as FileSystemDirectoryHandle, 'orig.md');
    await adapter.writeFile(handle, 'content');
    const dupe = await adapter.duplicate(parent as unknown as FileSystemDirectoryHandle, handle);
    expect((dupe as unknown as VirtualFileHandle).name).toBe('orig copy.md');
    const dupeContent = await adapter.readFile(dupe);
    expect(dupeContent.content).toBe('content');
  });

  it('remove deletes the entry from the parent', async () => {
    const parent = new VirtualDirectoryHandle('root');
    const handle = await adapter.createFile(parent as unknown as FileSystemDirectoryHandle, 'gone.md');
    await adapter.remove(parent as unknown as FileSystemDirectoryHandle, handle);
    const entries = await adapter.listChildren(parent as unknown as FileSystemDirectoryHandle);
    expect(entries).toEqual([]);
  });

  it('requestPersistedPermission is always granted (no platform permission model)', async () => {
    expect(await adapter.requestPersistedPermission()).toBe('granted');
  });
});
