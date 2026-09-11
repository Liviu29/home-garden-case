import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CapacityBar } from './capacity-bar';

@Component({
  imports: [CapacityBar],
  template: `<app-capacity-bar [used]="used()" [total]="total()" [showLabel]="showLabel()" />`,
})
class Host {
  readonly used = signal(0);
  readonly total = signal(20);
  readonly showLabel = signal(true);
}

/**
 * The occupancy bar. `used` is a sum of plant areas, so it arrives with binary
 * float noise (1.2 + 3 + 0.6 = 4.800000000000001) — none of it may reach the
 * screen or a screen reader.
 */
describe('CapacityBar', () => {
  const render = (used: number, total = 20) => {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.used.set(used);
    fixture.componentInstance.total.set(total);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, track: el.querySelector('.track')! };
  };

  it('shows a summed area to two decimals, never raw float noise', () => {
    const { el, track } = render(1.2 + 3 + 0.6); // 4.800000000000001
    expect(el.querySelector('.label span')?.textContent?.trim()).toBe('4.8 / 20 m²');
    expect(track.getAttribute('aria-valuenow')).toBe('4.8');
    expect(track.getAttribute('aria-label')).toBe('Surface used: 4.8 of 20 square meters');
  });

  it('keeps real decimals up to two places', () => {
    const { el } = render(13.35, 24.5);
    expect(el.querySelector('.label span')?.textContent?.trim()).toBe('13.35 / 24.5 m²');
  });

  it.each([
    { used: 5, level: 'ok' },
    { used: 17, level: 'warn' },
    { used: 20, level: 'full' },
  ])('colours the fill by load ($used of 20 m² → $level)', ({ used, level }) => {
    const { el } = render(used);
    expect(el.querySelector('.fill')?.classList).toContain(level);
  });

  it('draws the fill as a clamped transform, and can hide its caption', () => {
    const { fixture, el } = render(30); // over capacity
    expect((el.querySelector('.fill') as HTMLElement).style.transform).toBe('scaleX(1)');
    expect(el.querySelector('.pct')?.textContent?.trim()).toBe('150%');

    fixture.componentInstance.showLabel.set(false);
    fixture.detectChanges();
    expect(el.querySelector('.label')).toBeNull();
  });
});
