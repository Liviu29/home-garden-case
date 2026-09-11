import { Location } from '@angular/common';
import { SpyLocation, provideLocationMocks } from '@angular/common/testing';
import { Router, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    // jsdom does not implement scrolling; the root calls it on navigation.
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: '', children: [] },
          { path: 'a', children: [] },
          { path: 'b', children: [] },
        ]),
        provideLocationMocks(),
      ],
    }).compileComponents();
  });

  afterEach(() => scrollTo.mockRestore());

  it('opens every new page at its top, leaving Back/Forward to the browser', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    router.initialNavigation(); // what bootstrap does: also starts the popstate listener
    await fixture.whenStable();

    await router.navigateByUrl('/a');
    expect(scrollTo).toHaveBeenCalledWith(0, 0);

    await router.navigateByUrl('/b');
    scrollTo.mockClear();
    (TestBed.inject(Location) as SpyLocation).simulateUrlPop('/a'); // Back
    // The router starts a popstate navigation on a macrotask — wait for it.
    await vi.waitFor(() => expect(router.url).toBe('/a'));
    await fixture.whenStable();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('creates the root component', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('hosts the router outlet', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });
});
