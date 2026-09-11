import { TestBed } from '@angular/core/testing';
import { ToastStore } from '../../../core/errors/toast-store';
import { ExportPngButton } from './export-png-button';
import { SvgExporter } from './svg-export';

describe('ExportPngButton', () => {
  let exporter: { downloadPng: ReturnType<typeof vi.fn> };
  let toasts: ToastStore;
  let target: HTMLElement;

  const render = (selector?: string) => {
    const fixture = TestBed.createComponent(ExportPngButton);
    fixture.componentRef.setInput('target', target);
    fixture.componentRef.setInput('title', 'Back Garden plan');
    if (selector) {
      fixture.componentRef.setInput('selector', selector);
    }
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    return { fixture, button };
  };

  beforeEach(() => {
    exporter = { downloadPng: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({ providers: [{ provide: SvgExporter, useValue: exporter }] });
    toasts = TestBed.inject(ToastStore);
    target = document.createElement('div');
  });

  it('says what it saves, for screen readers', () => {
    const { button } = render();
    expect(button.getAttribute('aria-label')).toBe('Save Back Garden plan as PNG');
    expect(button.textContent?.trim()).toBe('PNG');
  });

  it('saves the SVG in its target, and is disabled while it does', async () => {
    target.innerHTML = '<svg class="drawing"></svg>';
    let finish!: () => void;
    exporter.downloadPng.mockReturnValue(new Promise<void>((r) => (finish = r)));
    const { fixture, button } = render();

    button.click();
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    expect(exporter.downloadPng).toHaveBeenCalledWith(
      target.querySelector('svg'),
      'Back Garden plan',
    );

    finish();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(button.disabled).toBe(false);
  });

  it('picks the drawing, not an icon before it, when given a selector', () => {
    target.innerHTML = '<svg class="icon"></svg><svg class="map-svg"></svg>';
    const { button } = render('svg.map-svg');

    button.click();

    expect(exporter.downloadPng).toHaveBeenCalledWith(
      target.querySelector('svg.map-svg'),
      'Back Garden plan',
    );
  });

  it('asks to wait when nothing is drawn yet', () => {
    const { button } = render();
    button.click();
    expect(exporter.downloadPng).not.toHaveBeenCalled();
    expect(toasts.toasts()[0]).toMatchObject({ tone: 'info' });
  });

  it('says so when the image cannot be made, and can be pressed again', async () => {
    target.innerHTML = '<svg></svg>';
    exporter.downloadPng.mockRejectedValue(new Error('no canvas'));
    const { fixture, button } = render();

    button.click();
    await vi.waitFor(() => expect(toasts.toasts().some((t) => t.tone === 'error')).toBe(true));
    fixture.detectChanges();

    expect(toasts.toasts().find((t) => t.tone === 'error')?.message).toBe(
      "Couldn't save “Back Garden plan” as an image.",
    );
    expect(button.disabled).toBe(false);
  });

  it('reports a failure that is not an Error too', async () => {
    target.innerHTML = '<svg></svg>';
    exporter.downloadPng.mockRejectedValue('denied');
    const { button } = render();

    button.click();
    await vi.waitFor(() => expect(toasts.toasts().some((t) => t.tone === 'error')).toBe(true));
  });
});
