import 'fake-indexeddb/auto';
import { IndexedDbBackupStore } from './indexeddb-backup-store';

describe('IndexedDbBackupStore', () => {
  let store: IndexedDbBackupStore;

  beforeEach(() => {
    store = new IndexedDbBackupStore();
  });

  it('returns null for a path with no backup', async () => {
    expect(await store.get('does/not/exist.md')).toBeNull();
  });

  it('round-trips a put/get by path', async () => {
    await store.put({ path: 'notes.md', content: 'hello', savedAt: 123 });
    const record = await store.get('notes.md');
    expect(record).toEqual({ path: 'notes.md', content: 'hello', savedAt: 123 });
  });

  it('put overwrites the previous backup for the same path', async () => {
    await store.put({ path: 'notes.md', content: 'v1', savedAt: 1 });
    await store.put({ path: 'notes.md', content: 'v2', savedAt: 2 });
    const record = await store.get('notes.md');
    expect(record?.content).toBe('v2');
    expect(record?.savedAt).toBe(2);
  });

  it('remove deletes the backup', async () => {
    await store.put({ path: 'notes.md', content: 'hello', savedAt: 1 });
    await store.remove('notes.md');
    expect(await store.get('notes.md')).toBeNull();
  });
});
