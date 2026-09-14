import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Options } from 'highcharts';
import { Logger } from '../../../core/logging/logger';
import { Chart } from './chart';
import { type HighchartsLib, HighchartsLoader } from './highcharts-loader';

@Component({
  imports: [Chart],
  template: `
    @if (show()) {
      <app-chart [options]="options()" fallback="No chart today." />
    }
  `,
})
class Host {
  readonly options = signal<Options>({ title: { text: 'First' } });
  readonly show = signal(true);
}

function fakeLibrary() {
  const instance = { update: vi.fn(), destroy: vi.fn() };
  const chart = vi.fn<(container: HTMLElement, options: Options) => typeof instance>(
    () => instance,
  );
  return { library: { chart } as unknown as HighchartsLib, chart, instance };
}

describe('Chart (Highcharts on demand)', () => {
  const mount = (load: () => Promise<HighchartsLib>) => {
    const logger = { error: vi.fn(), warn: vi.fn() };
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        { provide: HighchartsLoader, useValue: { load } },
        { provide: Logger, useValue: logger },
      ],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return { fixture, logger, el: fixture.nativeElement as HTMLElement };
  };

  it('holds its space with a skeleton until the library arrives, then draws into its host', async () => {
    const { library, chart } = fakeLibrary();
    let resolve!: (lib: HighchartsLib) => void;
    const { fixture, el } = mount(() => new Promise((r) => (resolve = r)));
    expect(el.querySelector('app-skeleton')).not.toBeNull();

    resolve(library);
    await vi.waitFor(() => expect(chart).toHaveBeenCalledTimes(1));
    fixture.detectChanges();

    const [container, options] = chart.mock.calls[0];
    expect(container.classList.contains('chart__host')).toBe(true);
    expect(options).toEqual({ title: { text: 'First' } });
    expect(el.querySelector('app-skeleton')).toBeNull();
  });

  it('updates the same chart when the options change — never a second instance', async () => {
    const { library, chart, instance } = fakeLibrary();
    const { fixture } = mount(() => Promise.resolve(library));
    await vi.waitFor(() => expect(chart).toHaveBeenCalledTimes(1));

    fixture.componentInstance.options.set({ title: { text: 'Second' } });
    fixture.detectChanges();

    await vi.waitFor(() =>
      expect(instance.update).toHaveBeenCalledWith({ title: { text: 'Second' } }, true, true),
    );
    expect(chart).toHaveBeenCalledTimes(1);
  });

  it('destroys the chart together with the component', async () => {
    const { library, chart, instance } = fakeLibrary();
    const { fixture } = mount(() => Promise.resolve(library));
    await vi.waitFor(() => expect(chart).toHaveBeenCalled());

    fixture.componentInstance.show.set(false);
    fixture.detectChanges();

    expect(instance.destroy).toHaveBeenCalledTimes(1);
  });

  it('never draws into a component that was removed while the library loaded', async () => {
    const { library, chart } = fakeLibrary();
    let resolve!: (lib: HighchartsLib) => void;
    const { fixture } = mount(() => new Promise((r) => (resolve = r)));

    fixture.componentInstance.show.set(false);
    fixture.detectChanges();
    resolve(library);
    await Promise.resolve();
    await Promise.resolve();

    expect(chart).not.toHaveBeenCalled();
  });

  it('shows the fallback text and reports the failure when the library cannot load', async () => {
    const { fixture, logger, el } = mount(() => Promise.reject(new Error('offline')));

    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled());
    fixture.detectChanges();

    expect(el.textContent).toContain('No chart today.');
    expect(el.querySelector('app-skeleton')).toBeNull();
    expect(logger.error.mock.calls[0][0]).toBe('chart');
  });
});
