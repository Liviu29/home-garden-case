import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { HumidityGauge } from './humidity-gauge';

@Component({
  imports: [HumidityGauge],
  template: `<app-humidity-gauge [value]="value" [target]="55" />`,
})
class Host {
  value: number | null = null;
}

describe('HumidityGauge (no-data honesty)', () => {
  async function mount(value: number | null) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.value = value;
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the measured average when plants exist', async () => {
    const el = await mount(62.4);
    expect(el.textContent).toContain('62%');
    expect(el.textContent).toContain('avg humidity');
    expect(el.querySelector('svg')?.getAttribute('aria-label')).toContain('Average humidity 62');
  });

  it('never presents the target as a measurement when there is no data', async () => {
    const el = await mount(null);
    expect(el.textContent).toContain('—');
    expect(el.textContent).toContain('no plants yet');
    expect(el.textContent).not.toContain('avg humidity');
    expect(el.querySelector('svg')?.getAttribute('aria-label')).toContain(
      'No measured humidity yet',
    );
    expect(el.textContent).toContain('target 55%'); // the target marker stays honest
  });
});
