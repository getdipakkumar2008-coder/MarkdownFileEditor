import { Component, computed, signal } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { WorkspaceState } from '../../state/workspace-state';
import { FileOperationsService } from './file-operations.service';
import { TreeEntry } from '../../core/file-system-adapter';
import { isMarkdownFile } from '../../adapters/filesystem/native-file-system-adapter';
import { flattenTree, TreeRow } from './flatten-tree';
import { ContextMenuComponent, ContextMenuAction } from './context-menu.component';
import { NamePromptDialogComponent } from '../dialogs/name-prompt-dialog.component';
import { ConfirmDialogComponent } from '../dialogs/confirm-dialog.component';

interface ContextMenuState {
  x: number;
  y: number;
  row: TreeRow | null; // null = right-clicked empty area (root-level actions only)
  items: ContextMenuAction[];
}

type NamePromptMode =
  | { kind: 'new-file'; parentHandle: FileSystemDirectoryHandle; parentPath: string | null }
  | { kind: 'new-folder'; parentHandle: FileSystemDirectoryHandle; parentPath: string | null }
  | { kind: 'rename'; row: TreeRow };

interface NamePromptState {
  title: string;
  initialValue: string;
  confirmLabel: string;
  mode: NamePromptMode;
}

/**
 * FR-1..4 (doc/specification.md §3.1): virtualized tree (CDK viewport, only
 * visible rows touch the DOM), lazy per-folder expansion, and the New
 * File/New Folder/Rename/Delete/Duplicate context menu.
 */
@Component({
  selector: 'app-file-tree',
  standalone: true,
  imports: [ScrollingModule, ContextMenuComponent, NamePromptDialogComponent, ConfirmDialogComponent],
  template: `
    <cdk-virtual-scroll-viewport itemSize="28" class="tree-viewport" role="tree" aria-label="File explorer" (contextmenu)="onEmptyAreaContextMenu($event)">
      <div
        *cdkVirtualFor="let row of rows()"
        class="tree-row"
        role="treeitem"
        tabindex="0"
        [attr.aria-level]="row.depth + 1"
        [attr.aria-expanded]="row.entry.kind === 'folder' ? row.expanded : null"
        [style.paddingLeft.px]="row.depth * 16 + 8"
        (click)="onRowActivate(row)"
        (keydown.enter)="onRowActivate(row)"
        (contextmenu)="onRowContextMenu($event, row)"
      >
        @if (row.entry.kind === 'folder') {
          <span class="chevron">{{ row.expanded ? '▾' : '▸' }}</span>
          <span>📁</span>
        } @else {
          <span class="chevron-spacer"></span>
          <span>{{ isMarkdown(row.entry.name) ? '📝' : '📄' }}</span>
        }
        <span class="name">{{ row.entry.name }}</span>
      </div>
    </cdk-virtual-scroll-viewport>

    @if (contextMenu(); as menu) {
      <app-context-menu [x]="menu.x" [y]="menu.y" [items]="menu.items" (select)="onMenuAction($event, menu.row)" (dismiss)="closeContextMenu()" />
    }

    @if (namePrompt(); as prompt) {
      <app-name-prompt-dialog
        [title]="prompt.title"
        [initialValue]="prompt.initialValue"
        [confirmLabel]="prompt.confirmLabel"
        (confirm)="onNamePromptConfirm($event)"
        (cancel)="closeNamePrompt()"
      />
    }

    @if (deleteTarget(); as target) {
      <app-confirm-dialog
        title="Delete"
        [message]="'Delete \\'' + target.entry.name + '\\'? This cannot be undone.'"
        confirmLabel="Delete"
        (confirm)="onConfirmDelete()"
        (cancel)="closeDeleteConfirm()"
      />
    }
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .tree-viewport {
        height: 100%;
      }
      .tree-row {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        height: 28px;
        cursor: pointer;
        border-radius: 4px;
        white-space: nowrap;
      }
      .tree-row:hover,
      .tree-row:focus {
        background: color-mix(in srgb, currentColor 10%, transparent);
        outline: none;
      }
      .chevron,
      .chevron-spacer {
        display: inline-block;
        width: 1em;
        text-align: center;
        opacity: 0.7;
      }
      .name {
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `,
  ],
})
export class FileTreeComponent {
  readonly rows = computed<TreeRow[]>(() => {
    const root = this.state.rootHandle();
    if (!root) return [];
    return flattenTree(this.state.tree(), root, this.state.expandedPaths(), this.state.childrenCache());
  });

  readonly contextMenu = signal<ContextMenuState | null>(null);
  readonly namePrompt = signal<NamePromptState | null>(null);
  readonly deleteTarget = signal<TreeRow | null>(null);

  constructor(
    readonly state: WorkspaceState,
    private readonly ops: FileOperationsService
  ) {}

  isMarkdown(name: string): boolean {
    return isMarkdownFile(name);
  }

  async onRowActivate(row: TreeRow): Promise<void> {
    if (row.entry.kind === 'folder') {
      await this.ops.toggleFolder(row.entry, row.fullPath);
    } else {
      await this.ops.openFile(row.entry.handle as FileSystemFileHandle, row.fullPath);
    }
  }

  onRowContextMenu(event: MouseEvent, row: TreeRow): void {
    event.preventDefault();
    event.stopPropagation();
    const items: ContextMenuAction[] =
      row.entry.kind === 'folder'
        ? [
            { id: 'new-file', label: 'New File' },
            { id: 'new-folder', label: 'New Folder' },
            { id: 'rename', label: 'Rename' },
            { id: 'delete', label: 'Delete', danger: true },
          ]
        : [
            { id: 'rename', label: 'Rename' },
            { id: 'duplicate', label: 'Duplicate' },
            { id: 'delete', label: 'Delete', danger: true },
          ];
    this.contextMenu.set({ x: event.clientX, y: event.clientY, row, items });
  }

  onEmptyAreaContextMenu(event: MouseEvent): void {
    const root = this.state.rootHandle();
    if (!root) return;
    event.preventDefault();
    this.contextMenu.set({
      x: event.clientX,
      y: event.clientY,
      row: null,
      items: [
        { id: 'new-file', label: 'New File' },
        { id: 'new-folder', label: 'New Folder' },
      ],
    });
  }

  closeContextMenu(): void {
    this.contextMenu.set(null);
  }

  async onMenuAction(actionId: string, row: TreeRow | null): Promise<void> {
    this.closeContextMenu();
    const root = this.state.rootHandle();
    if (!root) return;

    const parentHandle = row ? (row.entry.kind === 'folder' ? (row.entry.handle as FileSystemDirectoryHandle) : row.parentHandle) : root;
    const parentPath = row ? (row.entry.kind === 'folder' ? row.fullPath : row.parentPath) : null;

    switch (actionId) {
      case 'new-file':
        this.namePrompt.set({
          title: 'New file name',
          initialValue: '',
          confirmLabel: 'Create',
          mode: { kind: 'new-file', parentHandle, parentPath },
        });
        break;
      case 'new-folder':
        this.namePrompt.set({
          title: 'New folder name',
          initialValue: '',
          confirmLabel: 'Create',
          mode: { kind: 'new-folder', parentHandle, parentPath },
        });
        break;
      case 'rename':
        if (row) {
          this.namePrompt.set({
            title: 'Rename to',
            initialValue: row.entry.name,
            confirmLabel: 'Rename',
            mode: { kind: 'rename', row },
          });
        }
        break;
      case 'duplicate':
        if (row && row.entry.kind === 'file') {
          await this.ops.duplicate(row.parentHandle, row.parentPath, row.entry.handle as FileSystemFileHandle);
        }
        break;
      case 'delete':
        if (row) this.deleteTarget.set(row);
        break;
    }
  }

  async onNamePromptConfirm(name: string): Promise<void> {
    const prompt = this.namePrompt();
    this.closeNamePrompt();
    if (!prompt) return;

    const { mode } = prompt;
    switch (mode.kind) {
      case 'new-file':
        await this.ops.createFile(mode.parentHandle, mode.parentPath, name);
        break;
      case 'new-folder':
        await this.ops.createFolder(mode.parentHandle, mode.parentPath, name);
        break;
      case 'rename':
        await this.ops.rename(mode.row.parentHandle, mode.row.parentPath, mode.row.entry.handle, mode.row.fullPath, name);
        break;
    }
  }

  closeNamePrompt(): void {
    this.namePrompt.set(null);
  }

  async onConfirmDelete(): Promise<void> {
    const row = this.deleteTarget();
    this.deleteTarget.set(null);
    if (!row) return;
    await this.ops.remove(row.parentHandle, row.parentPath, row.entry.handle, row.fullPath);
  }

  closeDeleteConfirm(): void {
    this.deleteTarget.set(null);
  }
}
