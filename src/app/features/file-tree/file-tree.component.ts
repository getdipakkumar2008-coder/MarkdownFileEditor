import { Component, ViewChild, computed, signal } from '@angular/core';
import { ScrollingModule, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { WorkspaceState } from '../../state/workspace-state';
import { FileOperationsService } from './file-operations.service';
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
  /** Element to restore focus to once the menu closes. */
  triggerEl: HTMLElement | null;
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
 * FR-1..4 (doc/specification.md §3.1) + Accessibility NFRs (§4): virtualized
 * tree (CDK viewport, only visible rows touch the DOM), lazy per-folder
 * expansion, and the New File/New Folder/Rename/Delete/Duplicate context
 * menu — all reachable without a mouse via the WAI-ARIA treeview roving-
 * tabindex pattern (Up/Down/Left/Right/Home/End/Enter, plus the Menu key or
 * Shift+F10 for the context menu).
 */
@Component({
  selector: 'app-file-tree',
  standalone: true,
  imports: [ScrollingModule, ContextMenuComponent, NamePromptDialogComponent, ConfirmDialogComponent],
  template: `
    @if (state.hasWorkspace()) {
      <div class="root-actions">
        <button type="button" (click)="onMenuAction('new-file', null)">New File</button>
        <button type="button" (click)="onMenuAction('new-folder', null)">New Folder</button>
      </div>
    }

    <cdk-virtual-scroll-viewport itemSize="28" class="tree-viewport" role="tree" aria-label="File explorer" (contextmenu)="onEmptyAreaContextMenu($event)">
      <div
        *cdkVirtualFor="let row of rows(); let i = index"
        class="tree-row"
        role="treeitem"
        [attr.data-row-index]="i"
        [attr.tabindex]="i === focusedIndex() ? 0 : -1"
        [attr.aria-level]="row.depth + 1"
        [attr.aria-expanded]="row.entry.kind === 'folder' ? row.expanded : null"
        [style.paddingLeft.px]="row.depth * 16 + 8"
        (click)="onRowClick(row, i)"
        (focus)="focusedIndex.set(i)"
        (keydown)="onKeydown($event, row, i)"
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
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .root-actions {
        display: flex;
        gap: 0.4rem;
        padding: 0.4rem 0.5rem;
        border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent);
        flex: none;
      }
      .root-actions button {
        font-size: 0.8em;
      }
      .tree-viewport {
        flex: 1;
        min-height: 0;
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
      .tree-row:hover {
        background: color-mix(in srgb, currentColor 10%, transparent);
      }
      .tree-row:focus-visible,
      .tree-row:focus {
        background: color-mix(in srgb, currentColor 10%, transparent);
        outline: 2px solid Highlight;
        outline-offset: -2px;
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
  @ViewChild(CdkVirtualScrollViewport) private viewport?: CdkVirtualScrollViewport;

  readonly rows = computed<TreeRow[]>(() => {
    const root = this.state.rootHandle();
    if (!root) return [];
    return flattenTree(this.state.tree(), root, this.state.expandedPaths(), this.state.childrenCache());
  });

  readonly focusedIndex = signal(0);
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

  async onRowClick(row: TreeRow, index: number): Promise<void> {
    this.focusedIndex.set(index);
    await this.activate(row);
  }

  private async activate(row: TreeRow): Promise<void> {
    if (row.entry.kind === 'folder') {
      await this.ops.toggleFolder(row.entry, row.fullPath);
    } else {
      await this.ops.openFile(row.entry.handle as FileSystemFileHandle, row.fullPath);
    }
  }

  async onKeydown(event: KeyboardEvent, row: TreeRow, index: number): Promise<void> {
    const rows = this.rows();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        await this.focusIndex(Math.min(index + 1, rows.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        await this.focusIndex(Math.max(index - 1, 0));
        break;
      case 'Home':
        event.preventDefault();
        await this.focusIndex(0);
        break;
      case 'End':
        event.preventDefault();
        await this.focusIndex(rows.length - 1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (row.entry.kind === 'folder') {
          if (!row.expanded) {
            await this.ops.toggleFolder(row.entry, row.fullPath);
          } else if (index + 1 < rows.length) {
            await this.focusIndex(index + 1);
          }
        }
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (row.entry.kind === 'folder' && row.expanded) {
          await this.ops.toggleFolder(row.entry, row.fullPath);
        } else if (row.parentPath !== null) {
          const parentIndex = rows.findIndex((r) => r.fullPath === row.parentPath);
          if (parentIndex >= 0) await this.focusIndex(parentIndex);
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        await this.activate(row);
        break;
      case 'ContextMenu':
        event.preventDefault();
        this.openMenuNear(event.currentTarget as HTMLElement, row);
        break;
      case 'F10':
        if (event.shiftKey) {
          event.preventDefault();
          this.openMenuNear(event.currentTarget as HTMLElement, row);
        }
        break;
    }
  }

  /** Roving-tabindex focus move — scrolls the target row into the (virtualized) viewport first if needed. */
  private async focusIndex(index: number): Promise<void> {
    if (index < 0 || index >= this.rows().length) return;
    this.focusedIndex.set(index);
    this.viewport?.scrollToIndex(index, 'auto');
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const el = this.viewport?.elementRef.nativeElement.querySelector<HTMLElement>(`[data-row-index="${index}"]`);
    el?.focus();
  }

  private itemsForRow(row: TreeRow): ContextMenuAction[] {
    return row.entry.kind === 'folder'
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
  }

  onRowContextMenu(event: MouseEvent, row: TreeRow): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenu.set({
      x: event.clientX,
      y: event.clientY,
      row,
      items: this.itemsForRow(row),
      triggerEl: event.currentTarget as HTMLElement,
    });
  }

  private openMenuNear(target: HTMLElement, row: TreeRow): void {
    const rect = target.getBoundingClientRect();
    this.contextMenu.set({
      x: rect.left,
      y: rect.bottom,
      row,
      items: this.itemsForRow(row),
      triggerEl: target,
    });
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
      triggerEl: null,
    });
  }

  closeContextMenu(): void {
    const menu = this.contextMenu();
    this.contextMenu.set(null);
    menu?.triggerEl?.focus();
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
