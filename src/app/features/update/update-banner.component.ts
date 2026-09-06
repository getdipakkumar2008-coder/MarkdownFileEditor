import { Component, OnDestroy, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

/**
 * Architecture.md §12: the service worker already fetches updates in the
 * background (provideServiceWorker in app.config.ts) but previously never
 * told the user — this closes that gap with a small, dismissible prompt.
 */
@Component({
  selector: 'app-update-banner',
  standalone: true,
  template: `
    @if (updateReady()) {
      <div class="update-banner" role="status">
        <span>A new version is available.</span>
        <button type="button" (click)="reload()">Reload to update</button>
        <button type="button" class="dismiss" (click)="dismiss()" aria-label="Dismiss">✕</button>
      </div>
    }
  `,
  styles: [
    `
      .update-banner {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem 0.75rem;
        background: color-mix(in srgb, Highlight 15%, Canvas);
        border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent);
        font-size: 0.9em;
      }
      .dismiss {
        margin-left: auto;
        background: none;
        border: none;
        cursor: pointer;
      }
    `,
  ],
})
export class UpdateBannerComponent implements OnDestroy {
  readonly updateReady = signal(false);
  private readonly subscription?: Subscription;

  constructor(private readonly swUpdate: SwUpdate) {
    if (this.swUpdate.isEnabled) {
      this.subscription = this.swUpdate.versionUpdates
        .pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'))
        .subscribe(() => this.updateReady.set(true));
    }
  }

  reload(): void {
    document.location.reload();
  }

  dismiss(): void {
    this.updateReady.set(false);
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }
}
