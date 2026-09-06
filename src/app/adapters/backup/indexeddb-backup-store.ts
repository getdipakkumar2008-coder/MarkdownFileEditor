import { Injectable } from '@angular/core';
import { BackupRecord, BackupStore } from '../../core/backup-store';

const DB_NAME = 'md-editor-backups';
const DB_VERSION = 1;
const STORE_NAME = 'backups';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'path' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Crash-recovery backup, independent of disk writes (Architecture.md §2.2,
 * FR-12). A disk-write failure must never prevent this from succeeding, and
 * vice versa — callers (AutosaveService) run both writes via
 * Promise.allSettled, never awaiting one before starting the other.
 */
@Injectable({ providedIn: 'root' })
export class IndexedDbBackupStore implements BackupStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDb();
    }
    return this.dbPromise;
  }

  async put(record: BackupRecord): Promise<void> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async get(path: string): Promise<BackupRecord | null> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(path);
      request.onsuccess = () => resolve((request.result as BackupRecord) ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async remove(path: string): Promise<void> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(path);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
