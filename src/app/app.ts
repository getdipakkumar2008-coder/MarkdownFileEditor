import { Component, HostListener } from '@angular/core';
import { ToolbarComponent } from './features/toolbar/toolbar.component';
import { FileTreeComponent } from './features/file-tree/file-tree.component';
import { EditorComponent } from './features/editor/editor.component';
import { PreviewComponent } from './features/preview/preview.component';
import { RecoveryDialogComponent } from './features/dialogs/recovery-dialog.component';
import { SaveIssueDialogComponent } from './features/dialogs/save-issue-dialog.component';
import { FileOperationsService } from './features/file-tree/file-operations.service';
import { WorkspaceState } from './state/workspace-state';
import { AutosaveService } from './state/autosave.service';

const MODAL_ERROR_CODES = new Set(['external-modification', 'permission-revoked']);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    ToolbarComponent,
    FileTreeComponent,
    EditorComponent,
    PreviewComponent,
    RecoveryDialogComponent,
    SaveIssueDialogComponent,
  ],
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  constructor(
    readonly state: WorkspaceState,
    private readonly ops: FileOperationsService,
    // Injected solely to force instantiation — its effect() wires itself up
    // in the constructor and needs no direct calls from this component.
    private readonly autosave: AutosaveService
  ) {}

  showSaveIssueDialog(): boolean {
    const file = this.state.openFile();
    return file?.saveState === 'error' && !!file.saveErrorCode && MODAL_ERROR_CODES.has(file.saveErrorCode);
  }

  onRestoreBackup(): void {
    this.ops.applyRecovery();
  }

  async onDiscardBackup(): Promise<void> {
    await this.ops.discardRecovery();
  }

  async onOverwriteAnyway(): Promise<void> {
    await this.ops.overwriteAnyway();
  }

  async onReloadFromDisk(): Promise<void> {
    await this.ops.reloadFromDisk();
  }

  async onRegrantPermission(): Promise<void> {
    await this.ops.regrantPermissionAndRetry();
  }

  async onOpenFolder(): Promise<void> {
    await this.ops.openWorkspace();
  }

  async onSave(): Promise<void> {
    await this.ops.save();
  }

  onContentChanged(content: string): void {
    this.state.updateContent(content);
  }

  // FR-15: warn before closing a tab with unsaved changes.
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.state.openFile()?.dirty) {
      event.preventDefault();
    }
  }
}
