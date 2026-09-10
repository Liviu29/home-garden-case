import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StatusBadge, StatusTone } from './status-badge';

@Component({
  imports: [StatusBadge],
  template: `<app-status-badge [tone]="tone">Healthy capacity</app-status-badge>`,
})
class Host {
  tone: StatusTone = 'success';
}

/**
 * A11y rule this component exists to enforce: status is text + colour, never
 * colour alone. The projected label is the accessible content.
 */
describe('StatusBadge', () => {
  const render = (tone: StatusTone) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.tone = tone;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('projects its label as text, so the state is never colour-only', () => {
    expect(render('success').textContent).toContain('Healthy capacity');
  });

  it.each<StatusTone>(['success', 'neutral', 'warning', 'critical'])(
    'applies the %s tone class',
    (tone) => {
      expect(render(tone).querySelector('.chip')?.classList).toContain(tone);
    },
  );
});
