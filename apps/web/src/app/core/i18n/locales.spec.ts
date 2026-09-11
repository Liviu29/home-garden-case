import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { LOCALE_BROWSER, Locales } from './locales';

const setup = (baseURI: string, localeId = 'en') => {
  const browser = { baseURI: () => baseURI, setCookie: vi.fn(), assign: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'gardens/:id', children: [] }]),
      { provide: LOCALE_ID, useValue: localeId },
      { provide: LOCALE_BROWSER, useValue: browser },
    ],
  });
  return { browser, locales: TestBed.inject(Locales) };
};

describe('Locales (the EN/NL switch)', () => {
  it('knows it is not a localized build on a development server', () => {
    expect(setup('http://localhost:4200/').locales.localized).toBe(false);
  });

  it('knows a localized build by its /en/ or /nl/ base', () => {
    expect(setup('https://garden.example/nl/').locales.localized).toBe(true);
  });

  it('reads the current language from the build', () => {
    expect(setup('https://garden.example/nl/', 'nl').locales.current).toBe('nl');
    TestBed.resetTestingModule();
    expect(setup('https://garden.example/en/', 'en-US').locales.current).toBe('en');
  });

  it('opens the same page in the other language, and remembers the choice', async () => {
    const { browser, locales } = setup('https://garden.example/en/');
    await TestBed.inject(Router).navigateByUrl('/gardens/3');

    expect(locales.hrefFor('nl')).toBe('/nl/gardens/3');
    locales.switchTo('nl');

    expect(browser.setCookie).toHaveBeenCalledWith(expect.stringContaining('lang=nl; path=/'));
    expect(browser.assign).toHaveBeenCalledWith('/nl/gardens/3');
  });

  it('talks to the real document by default', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const browser = TestBed.inject(LOCALE_BROWSER);
    expect(browser.baseURI()).toBe(document.baseURI);
    browser.setCookie('lang-test=1; path=/');
    expect(document.cookie).toContain('lang-test=1');
  });
});
