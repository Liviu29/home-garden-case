import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { ValuePresets, type ValuePresetOption } from './value-presets';

const OPTIONS: readonly ValuePresetOption[] = [
  { label: 'Dry', value: 40, description: '40%' },
  { label: 'Balanced', value: 60, description: '60%', recommended: true },
  { label: 'Humid', value: 80, description: '80%' },
];

@Component({
  imports: [ValuePresets],
  template: `<app-value-presets
    label="Target humidity presets"
    [options]="options"
    [value]="value()"
    (selectedChange)="value.set($event)"
  />`,
})
class Host {
  readonly options = OPTIONS;
  readonly value = signal<number | null>(null);
}

describe('ValuePresets (quick-picks that never bypass the form)', () => {
  function mount() {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture;
  }

  it('renders every option with label and description in an accessible group', () => {
    const el: HTMLElement = mount().nativeElement;
    const group = el.querySelector('[role="group"]')!;
    expect(group.getAttribute('aria-label')).toBe('Target humidity presets');
    const buttons = el.querySelectorAll('button.preset');
    expect(buttons).toHaveLength(3);
    expect(buttons[1].textContent).toContain('Balanced');
    expect(buttons[1].textContent).toContain('60%');
  });

  it('marks the recommended option with a visible badge', () => {
    const el: HTMLElement = mount().nativeElement;
    const badges = el.querySelectorAll('.recommended-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0].closest('button')?.textContent).toContain('Balanced');
  });

  it('emits the picked value and reflects the selection as aria-pressed', () => {
    const fixture = mount();
    const el: HTMLElement = fixture.nativeElement;
    const humid = [...el.querySelectorAll<HTMLButtonElement>('button.preset')].find((b) =>
      b.textContent?.includes('Humid'),
    )!;
    humid.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe(80);
    expect(humid.getAttribute('aria-pressed')).toBe('true');
  });

  it('highlights no chip when the current value is custom', () => {
    const fixture = mount();
    fixture.componentInstance.value.set(55); // typed by hand into the field
    fixture.detectChanges();
    const pressed = fixture.nativeElement.querySelectorAll('[aria-pressed="true"]');
    expect(pressed).toHaveLength(0);
  });
});
