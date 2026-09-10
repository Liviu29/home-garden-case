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
  readonly progress = signal<number | null>(null);
  readonly progressWarn = signal(false);
}

/**
 * The KPI tile. Its count-up animation is decorative, so the contract that
 * matters is: the FINAL value is always correct and always reached, including
 * when motion is off, when the environment has no `matchMedia`, and when the
 * value changes mid-flight.
 */
describe('StatCard', () => {
  const render = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  };

  afterEach(() => vi.unstubAllGlobals());

  const reducedMotion = (reduce: boolean) =>
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: reduce,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    );

  it('renders the label', () => {
    const { el } = render();
    expect(el.textContent).toContain('Gardens');
  });

  it('renders zero immediately — there is nothing to count up to', () => {
    reducedMotion(false);
    const { el } = render();
    expect(el.querySelector('.value')?.textContent).toContain('0');
  });

  it('jumps straight to the value under reduced motion', () => {
    reducedMotion(true);
    const { fixture, host, el } = render();

    host.value.set(42);
    fixture.detectChanges();

    expect(el.textContent).toContain('42');
  });

  it('treats a missing matchMedia as reduced motion rather than crashing', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { fixture, host, el } = render();

    host.value.set(7);
    fixture.detectChanges();

    expect(el.textContent).toContain('7');
  });

  describe('with motion allowed', () => {
    // jsdom's rAF timestamps are not on `performance.now()`'s clock, which
    // makes the easing produce nonsense. Driving the frame callbacks with the
    // same clock the component reads keeps the animation under test rather
    // than the environment.
    const runFrames = () => {
      const callbacks: FrameRequestCallback[] = [];
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        callbacks.push(cb);
        return callbacks.length;
      });
      vi.stubGlobal('cancelAnimationFrame', () => undefined);
      return (elapsedMs: number) => {
        const pending = callbacks.splice(0, callbacks.length);
        for (const cb of pending) {
          cb(performance.now() + elapsedMs);
        }
      };
    };

    it('reaches exactly the target value when the animation completes', () => {
      reducedMotion(false);
      const advance = runFrames();
      const { fixture, host, el } = render();

      host.value.set(25);
      fixture.detectChanges();

      advance(1000); // past the 600ms duration
      fixture.detectChanges();

      expect(el.querySelector('.value')?.textContent).toContain('25');
    });

    it('lands on the newest value when it changes mid-animation', () => {
      reducedMotion(false);
      const advance = runFrames();
      const { fixture, host, el } = render();

      host.value.set(50);
      fixture.detectChanges();
      advance(100); // part-way there
      host.value.set(3); // target changes
      fixture.detectChanges();
      advance(1000);
      fixture.detectChanges();

      expect(el.querySelector('.value')?.textContent).toContain('3');
    });

    it('steps through intermediate values rather than jumping', () => {
      reducedMotion(false);
      const advance = runFrames();
      const { fixture, host, el } = render();

      host.value.set(100);
      fixture.detectChanges();
      advance(200); // one third of the way
      fixture.detectChanges();

      const shown = Number(el.querySelector('.value')?.textContent);
      expect(shown).toBeGreaterThan(0);
      expect(shown).toBeLessThan(100);
    });
  });

  it('renders a suffix beside the value', () => {
    reducedMotion(true);
    const { fixture, host, el } = render();

    host.value.set(71);
    host.suffix.set('%');
    fixture.detectChanges();

    expect(el.textContent).toContain('71');
    expect(el.textContent).toContain('%');
  });

  it('renders the secondary context line only when there is one', () => {
    reducedMotion(true);
    const { fixture, host, el } = render();
    expect(el.querySelector('.context')).toBeNull();

    host.context.set('3 healthy · 0 need attention');
    fixture.detectChanges();
    expect(el.textContent).toContain('3 healthy');
  });

  it('renders no progress strip by default', () => {
    reducedMotion(true);
    const { el } = render();
    expect(el.querySelector('.strip')).toBeNull();
  });

  it('renders a progress strip as a percentage when given a ratio', () => {
    reducedMotion(true);
    const { fixture, host, el } = render();

    host.progress.set(0.42);
    fixture.detectChanges();

    expect(el.querySelector('.strip')).not.toBeNull();
    expect((el.querySelector('.strip-fill') as HTMLElement | null)?.style.width).toBe('42%');
  });

  it.each([
    { given: -1, expected: '0%' },
    { given: 2, expected: '100%' },
  ])('clamps an out-of-range ratio ($given → $expected)', ({ given, expected }) => {
    reducedMotion(true);
    const { fixture, host, el } = render();

    host.progress.set(given);
    fixture.detectChanges();

    expect((el.querySelector('.strip-fill') as HTMLElement | null)?.style.width).toBe(expected);
  });

  it('marks the strip as a warning when asked', () => {
    reducedMotion(true);
    const { fixture, host, el } = render();

    host.progress.set(0.95);
    host.progressWarn.set(true);
    fixture.detectChanges();

    expect(el.querySelector('.strip-fill')?.classList).toContain('warn');
  });
});
