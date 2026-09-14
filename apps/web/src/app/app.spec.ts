import { Location } from '@angular/common';
import { type SpyLocation, provideLocationMocks } from '@angular/common/testing';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

/** A page, as the shell and the welcome screen render one: a focusable main landmark. */
@Component({ template: '<main id="main-content" tabindex="-1">a page</main>' })
class Page {}

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
          { path: 'a', component: Page },
          { path: 'b', component: Page },
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

  it('moves focus to the new page’s content on navigation — not on the page load itself', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    router.initialNavigation();
    await fixture.whenStable();
    expect(document.activeElement).toBe(document.body); // the load: the document starts at its top

    await router.navigateByUrl('/a');
    await fixture.whenStable();
    expect(document.activeElement?.id).toBe('main-content');

    (document.activeElement as HTMLElement).blur();
    await router.navigateByUrl('/b');
    await fixture.whenStable();
    expect(document.activeElement?.id).toBe('main-content');
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
