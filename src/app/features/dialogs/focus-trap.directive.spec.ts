import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FocusTrapDirective } from './focus-trap.directive';

@Component({
  standalone: true,
  imports: [FocusTrapDirective],
  template: `
    <button id="trigger" (click)="open = true">Open</button>
    @if (open) {
      <div appFocusTrap (escape)="escaped = true">
        <button id="first">First</button>
        <input id="middle" type="text" value="rename me" />
        <button id="last">Last</button>
      </div>
    }
  `,
})
class HostComponent {
  open = false;
  escaped = false;
}

describe('FocusTrapDirective', () => {
  function setup(openImmediately = true) {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    if (openImmediately) {
      fixture.componentInstance.open = true;
    }
    fixture.detectChanges();
    return fixture;
  }

  it('focuses the first focusable element inside the trap after it opens', async () => {
    const fixture = setup();
    await new Promise((resolve) => queueMicrotask(resolve as () => void));
    await new Promise((resolve) => queueMicrotask(resolve as () => void));

    expect(document.activeElement?.id).toBe('first');
  });

  it('wraps Tab from the last element back to the first', () => {
    const fixture = setup();

    const last = fixture.nativeElement.querySelector('#last') as HTMLButtonElement;
    last.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(event);

    expect(document.activeElement?.id).toBe('first');
  });

  it('wraps Shift+Tab from the first element back to the last', () => {
    const fixture = setup();

    const first = fixture.nativeElement.querySelector('#first') as HTMLButtonElement;
    first.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    first.dispatchEvent(event);

    expect(document.activeElement?.id).toBe('last');
  });

  it('emits escape on the Escape key without closing anything itself', () => {
    const fixture = setup();

    const trapEl = fixture.nativeElement.querySelector('[appFocusTrap]') as HTMLElement;
    trapEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(fixture.componentInstance.escaped).toBe(true);
  });

  it('restores focus to the trigger element once the trap is destroyed', async () => {
    const fixture = setup(false);
    const trigger = fixture.nativeElement.querySelector('#trigger') as HTMLButtonElement;
    trigger.focus();
    expect(document.activeElement?.id).toBe('trigger');

    fixture.componentInstance.open = true;
    fixture.detectChanges();
    await new Promise((resolve) => queueMicrotask(resolve as () => void));

    fixture.componentInstance.open = false;
    fixture.detectChanges();

    expect(document.activeElement?.id).toBe('trigger');
  });
});
