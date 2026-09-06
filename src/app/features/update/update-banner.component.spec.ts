import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { UpdateBannerComponent } from './update-banner.component';

describe('UpdateBannerComponent', () => {
  let versionUpdates$: Subject<VersionEvent>;

  function setup(isEnabled: boolean) {
    versionUpdates$ = new Subject<VersionEvent>();
    TestBed.configureTestingModule({
      imports: [UpdateBannerComponent],
      providers: [
        {
          provide: SwUpdate,
          useValue: { isEnabled, versionUpdates: versionUpdates$.asObservable() },
        },
      ],
    });
    const fixture = TestBed.createComponent(UpdateBannerComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('shows nothing until a VERSION_READY event arrives', () => {
    const fixture = setup(true);
    expect(fixture.componentInstance.updateReady()).toBe(false);
    expect(fixture.nativeElement.querySelector('.update-banner')).toBeNull();
  });

  it('shows the reload prompt once VERSION_READY fires', () => {
    const fixture = setup(true);
    versionUpdates$.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'a' },
      latestVersion: { hash: 'b' },
    } as VersionEvent);
    fixture.detectChanges();

    expect(fixture.componentInstance.updateReady()).toBe(true);
    expect(fixture.nativeElement.querySelector('.update-banner')).not.toBeNull();
  });

  it('ignores non-VERSION_READY events', () => {
    const fixture = setup(true);
    versionUpdates$.next({ type: 'VERSION_DETECTED', version: { hash: 'b' } } as VersionEvent);
    fixture.detectChanges();

    expect(fixture.componentInstance.updateReady()).toBe(false);
  });

  it('dismiss() hides the banner again', () => {
    const fixture = setup(true);
    versionUpdates$.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'a' },
      latestVersion: { hash: 'b' },
    } as VersionEvent);
    fixture.detectChanges();

    fixture.componentInstance.dismiss();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.update-banner')).toBeNull();
  });

  it('does not subscribe at all when the service worker is disabled', () => {
    const fixture = setup(false);
    expect(versionUpdates$.observed).toBe(false);
    expect(fixture.componentInstance.updateReady()).toBe(false);
  });
});
