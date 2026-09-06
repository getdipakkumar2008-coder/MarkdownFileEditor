import { Injectable, OnDestroy, effect } from '@angular/core';
import { WorkspaceState } from './workspace-state';
import { FileOperationsService } from '../features/file-tree/file-operations.service';

/** FR-11 (doc/specification.md §3.4): 2-3s after the last keystroke. */
const AUTOSAVE_DEBOUNCE_MS = 2500;

/**
 * Debounced disk autosave. The parallel IndexedDB backup write happens
 * inside FileOperationsService.save() itself (and independently on failure)
 * so the two writes never share a failure mode — see Architecture.md §2.2.
 */
@Injectable({ providedIn: 'root' })
export class AutosaveService implements OnDestroy {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private watchedPath: string | null = null;

  constructor(
    private readonly state: WorkspaceState,
    private readonly ops: FileOperationsService
  ) {
    effect(() => {
      const file = this.state.openFile();

      if (file?.path !== this.watchedPath) {
        // Switched files (or closed one) — don't carry a stale timer across files.
        this.clearTimer();
        this.watchedPath = file?.path ?? null;
      }

      if (file?.dirty) {
        this.scheduleAutosave();
      } else {
        this.clearTimer();
      }
    });
  }

  private scheduleAutosave(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.ops.save();
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }
}
