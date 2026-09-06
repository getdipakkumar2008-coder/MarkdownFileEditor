import { TestBed } from '@angular/core/testing';
import { App } from './app';
import 'fake-indexeddb/auto';
import { FILE_SYSTEM_ADAPTER } from './core/file-system-adapter';
import { MARKDOWN_RENDERER } from './core/markdown-renderer';
import { BACKUP_STORE } from './core/backup-store';
import { ERROR_REPORTER } from './core/error-reporter';
import { NativeFileSystemAdapter } from './adapters/filesystem/native-file-system-adapter';
import { MarkdownItRenderer } from './adapters/markdown/markdown-it-renderer';
import { IndexedDbBackupStore } from './adapters/backup/indexeddb-backup-store';
import { NoopErrorReporter } from './adapters/telemetry/noop-error-reporter';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: FILE_SYSTEM_ADAPTER, useClass: NativeFileSystemAdapter },
        { provide: MARKDOWN_RENDERER, useClass: MarkdownItRenderer },
        { provide: BACKUP_STORE, useClass: IndexedDbBackupStore },
        { provide: ERROR_REPORTER, useClass: NoopErrorReporter },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('shows the empty state when no file is open', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty-state')?.textContent).toContain('Open a folder');
  });
});
