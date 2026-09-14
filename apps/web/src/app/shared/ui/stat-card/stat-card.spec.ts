import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StatCard } from './stat-card';

@Component({
  imports: [StatCard],
  template: `
    <app-stat-card
      [value]="value()"
      [label]="label()"
      [suffix]="suffix()"
      [context]="context()"
      [pending]="pending()"
      [valuePending]="valuePending()"
      [progress]="progress()"
      [progressWarn]="progressWarn()"
    />
  `,
})
class Host {
  readonly value = signal(0);
  readonly label = signal('Gardens');
  readonly suffix = signal('');
  readonly context = signal('');
  readonly pending = signal(false);
  readonly valuePending = signal(false);
  readonly progress = signal<number | null>(null);
  readonly progressWarn = signal(false);
}

/**
 * The KPI tile. The contract that matters: the value shown is always the real
 * value (no tween that shows wrong numbers mid-flight), the context line holds
 * its place while its data loads, and the strip is drawn with a transform.
 */
describe('StatCard', () => {
  const render = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  };

  const fill = (el: HTMLElement) => el.querySelector<HTMLElement>('.stat-card__strip-fill');

  it('renders the label', () => {
    const { el } = render();
    expect(el.textContent).toContain('Gardens');
  });

  it('renders the real value at once — no count-up through wrong numbers', () => {
    const { fixture, host, el } = render();

    host.value.set(42);
    fixture.detectChanges();

    expect(el.querySelector('.stat-card__value')?.textContent?.trim()).toBe('42');
  });

  it('renders a suffix beside the value', () => {
    const { fixture, host, el } = render();

    host.value.set(71);
    host.suffix.set('%');
    fixture.detectChanges();

    expect(el.querySelector('.stat-card__value')?.textContent?.trim()).toBe('71%');
  });

  it('renders the secondary context line only when there is one', () => {
    const { fixture, host, el } = render();
    expect(el.querySelector('.stat-card__context')).toBeNull();

    host.context.set('3 healthy · 0 need attention');
    fixture.detectChanges();
    expect(el.textContent).toContain('3 healthy');
  });

  it('holds the context line with a hidden ghost while its data is pending', () => {
    const { fixture, host, el } = render();

    host.pending.set(true);
    host.context.set('not yet');
    fixture.detectChanges();

    const ghost = el.querySelector('.stat-card__context--ghost');
    expect(ghost).not.toBeNull();
    expect(ghost?.getAttribute('aria-hidden')).toBe('true');
    expect(ghost?.querySelector('app-skeleton')).not.toBeNull();
    expect(el.textContent).not.toContain('not yet');

    host.pending.set(false);
    fixture.detectChanges();
    expect(el.querySelector('.stat-card__context--ghost')).toBeNull();
    expect(el.textContent).toContain('not yet');
  });

  it('ghosts the value itself while it is pending — never a partial number', () => {
    const { fixture, host, el } = render();

    host.value.set(8); // e.g. the plants of the gardens that answered first
    host.valuePending.set(true);
    fixture.detectChanges();

    const ghost = el.querySelector('.stat-card__value--ghost');
    expect(ghost?.getAttribute('aria-hidden')).toBe('true');
    expect(ghost?.querySelector('app-skeleton')).not.toBeNull();
    expect(el.textContent).not.toContain('8');

    host.value.set(34);
    host.valuePending.set(false);
    fixture.detectChanges();
    expect(el.querySelector('.stat-card__value--ghost')).toBeNull();
    expect(el.querySelector('.stat-card__value')?.textContent?.trim()).toBe('34');
  });

  it('renders no progress strip by default', () => {
    const { el } = render();
    expect(el.querySelector('.stat-card__strip')).toBeNull();
  });

  it('draws the progress strip as a transform scale, never a width', () => {
    const { fixture, host, el } = render();

    host.progress.set(0.42);
    fixture.detectChanges();

    expect(el.querySelector('.stat-card__strip')?.getAttribute('aria-valuenow')).toBe('42');
    expect(fill(el)?.style.transform).toBe('scaleX(0.42)');
    expect(fill(el)?.style.width).toBe('');
  });

  it.each([
    { given: -1, expected: 'scaleX(0)' },
    { given: 2, expected: 'scaleX(1)' },
  ])('clamps an out-of-range ratio ($given → $expected)', ({ given, expected }) => {
    const { fixture, host, el } = render();

    host.progress.set(given);
    fixture.detectChanges();

    expect(fill(el)?.style.transform).toBe(expected);
  });

  it('marks the strip as a warning when asked', () => {
    const { fixture, host, el } = render();

    host.progress.set(0.95);
    host.progressWarn.set(true);
    fixture.detectChanges();

    expect(fill(el)?.classList).toContain('stat-card__strip-fill--warn');
  });
});
