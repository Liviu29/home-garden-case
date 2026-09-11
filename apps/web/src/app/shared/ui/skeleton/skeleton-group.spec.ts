import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Skeleton } from './skeleton';
import { SkeletonGroup } from './skeleton-group';

@Component({
  imports: [SkeletonGroup, Skeleton],
  template: `
    <app-skeleton-group [loading]="loading()" [label]="label()">
      <div ghost class="ghost-layout"><app-skeleton variant="line" /></div>
      <p class="real">Real content</p>
    </app-skeleton-group>
  `,
})
class Host {
  readonly loading = signal(true);
  readonly label = signal('Loading gardens');
}

@Component({
  imports: [SkeletonGroup],
  template: `<app-skeleton-group [loading]="true"><div ghost></div></app-skeleton-group>`,
})
class DefaultLabelHost {}

/**
 * The cold-load wrapper. Its timing is CSS (`.skeleton-appear`), so there is
 * nothing to fake here: what matters is what renders, what assistive tech
 * hears, and that real content is never held back.
 */
describe('SkeletonGroup', () => {
  const render = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const group = () => el.querySelector('app-skeleton-group') as HTMLElement;
    const status = () => el.querySelector('[role="status"]')?.textContent?.trim();
    return { fixture, host: fixture.componentInstance, el, group, status };
  };

  it('renders the ghost — not the content — while loading', () => {
    const { el } = render();

    expect(el.querySelector('.ghost-layout')).not.toBeNull();
    expect(el.querySelector('.real')).toBeNull();
  });

  it('keeps the ghost in the layout but lets the engine delay its appearance', () => {
    const { el } = render();

    // In the DOM from the first frame (space reserved, nothing shifts later),
    // made visible by `.skeleton-appear` only after --skeleton-delay.
    expect(el.querySelector('.ghost-slot')?.classList).toContain('skeleton-appear');
  });

  it('hides the ghost from assistive tech and announces the load instead', () => {
    const { el, group, status } = render();

    expect(el.querySelector('.ghost-slot')?.getAttribute('aria-hidden')).toBe('true');
    expect(group().getAttribute('aria-busy')).toBe('true');
    expect(status()).toBe('Loading gardens');
  });

  it('renders the content in the same tick the data lands — no minimum display', () => {
    const { fixture, host, el, group, status } = render();

    host.loading.set(false);
    fixture.detectChanges();

    expect(el.querySelector('.real')).not.toBeNull();
    expect(el.querySelector('.ghost-layout')).toBeNull();
    expect(group().hasAttribute('aria-busy')).toBe(false);
    // The live region stays in place (reliable announcements); it just empties.
    expect(status()).toBe('');
  });

  it('shows the ghost again when a new cold load starts', () => {
    const { fixture, host, el, status } = render();
    host.loading.set(false);
    fixture.detectChanges();

    host.loading.set(true);
    fixture.detectChanges();

    expect(el.querySelector('.ghost-layout')).not.toBeNull();
    expect(status()).toBe('Loading gardens');
  });

  it('falls back to a generic announcement', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(DefaultLabelHost);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).querySelector(
      '[role="status"]',
    )?.textContent;
    expect(text?.trim()).toBe('Loading…');
  });
});
