import { LOCALE_ID } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import type { UserProfile } from '../api/models';
import { UsersApi } from '../api/users-api';
import { SessionStore } from '../auth/session-store';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { LOCALE_BROWSER } from '../i18n/locales';
import { Shell } from './shell';

const CONFIG = {
  apiBaseUrl: '/api',
  retry: { maxAttempts: 1, baseDelayMs: 1, backoffFactor: 1, maxDelayMs: 1 },
  cache: { freshTtlMs: 30_000 },
  toastDurationMs: 5000,
} as AppConfig;

const PROFILE: UserProfile = {
  userId: 1,
  emailAddress: 'liviu@example.com',
  firstName: 'Liviu',
  lastName: 'Nita',
  age: null,
};

describe('Shell — the EN/NL language switch', () => {
  let browser: {
    baseURI: () => string;
    setCookie: ReturnType<typeof vi.fn>;
    assign: ReturnType<typeof vi.fn>;
  };
  let fixture: ComponentFixture<Shell>;

  const render = async (baseURI: string, localeId = 'en') => {
    browser = { baseURI: () => baseURI, setCookie: vi.fn(), assign: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'gardens', children: [] },
          { path: 'welcome', children: [] },
        ]),
        provideNoopAnimations(),
        { provide: APP_CONFIG, useValue: CONFIG },
        // The shell checks the session on boot: this profile still exists.
        { provide: UsersApi, useValue: { getById: vi.fn().mockResolvedValue(PROFILE) } },
        { provide: LOCALE_ID, useValue: localeId },
        { provide: LOCALE_BROWSER, useValue: browser },
      ],
    });
    TestBed.inject(SessionStore).signIn(PROFILE);
    fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/gardens');
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  // signIn persists the session; later spec files must not start signed in.
  afterEach(() => localStorage.clear());

  it('stays hidden on a development server, which serves one language', async () => {
    const el = await render('http://localhost:4200/');
    expect(el.querySelector('nav.lang')).toBeNull();
  });

  it('offers both languages on a localized build, the current one marked', async () => {
    const el = await render('https://garden.example/nl/', 'nl');
    const links = [...el.querySelectorAll<HTMLAnchorElement>('nav.lang a')];

    expect(links.map((a) => a.textContent?.trim())).toEqual(['EN', 'NL']);
    expect(links.map((a) => a.getAttribute('aria-label'))).toEqual(['English', 'Nederlands']);
    expect(links[1].getAttribute('aria-current')).toBe('true');
    expect(links[0].getAttribute('aria-current')).toBeNull();
    expect(links[0].getAttribute('href')).toBe('/en/gardens');
  });

  it('keeps its links on the current page as the user navigates', async () => {
    const el = await render('https://garden.example/en/');
    await TestBed.inject(Router).navigateByUrl('/welcome');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelectorAll('nav.lang a')[1].getAttribute('href')).toBe('/nl/welcome');
  });

  it('switches to the other build on the same page, remembering the choice', async () => {
    const el = await render('https://garden.example/en/');
    const dutch = el.querySelectorAll<HTMLAnchorElement>('nav.lang a')[1];

    dutch.click();

    expect(browser.setCookie).toHaveBeenCalledWith(expect.stringContaining('lang=nl'));
    expect(browser.assign).toHaveBeenCalledWith('/nl/gardens');
  });
});
