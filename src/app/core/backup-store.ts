import { InjectionToken } from '@angular/core';

export interface BackupRecord {
  path: string;
  content: string;
  savedAt: number;
}

/**
 * IndexedDB-backed crash-recovery store. Independent of disk writes — see
 * Architecture.md §2.2: a disk-write failure must never block a backup write.
 */
export interface BackupStore {
  put(record: BackupRecord): Promise<void>;
  get(path: string): Promise<BackupRecord | null>;
  remove(path: string): Promise<void>;
}

export const BACKUP_STORE = new InjectionToken<BackupStore>('BACKUP_STORE');
