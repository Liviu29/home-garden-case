import { DOCUMENT, Injectable, InjectionToken, LOCALE_ID, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

export interface AppLocale {
  /** The build's sub-path and the `lang` attribute value. */
  readonly code: 'en' | 'nl';
  /** What the switcher shows. */
  readonly label: string;
  /** The language's own name, for screen readers. */
  readonly name: string;
}

/** The languages the production build is compiled into (angular.json `i18n`). */
export const APP_LOCALES: readonly AppLocale[] = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'nl', label: 'NL', name: 'Nederlands' },
];

/** Remembered for a year, so the site root opens in the language chosen last. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The browser APIs the switch uses — a seam, so tests need no real navigation. */
export interface LocaleBrowser {
  baseURI(): string;
  setCookie(cookie: string): void;
  assign(url: string): void;
}

export const LOCALE_BROWSER = new InjectionToken<LocaleBrowser>('LOCALE_BROWSER', {
  providedIn: 'root',
  factory: () => {
    const doc = inject(DOCUMENT);
    return {
      baseURI: () => doc.baseURI,
      setCookie: (cookie) => (doc.cookie = cookie),
      assign: (url) => doc.location.assign(url),
    };
  },
});

/**
 * The language switch. Every language is its own compiled build under
 * `/en/` or `/nl/` (compile-time i18n: no translation runtime, no flash of
 * the wrong language), so switching loads the other build on the same route.
 * A development server serves one language at `/`, where there is nothing
 * to switch to: `localized` is false and the switcher stays hidden.
 */
@Injectable({ providedIn: 'root' })
export class Locales {
  private readonly browser = inject(LOCALE_BROWSER);
  private readonly router = inject(Router);
  private readonly localeId = inject(LOCALE_ID);

  /** The current route, as a signal: the switcher's links follow navigation. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  readonly all = APP_LOCALES;

  /** Served from a localized build, i.e. under `/en/` or `/nl/`. */
  readonly localized = APP_LOCALES.some(
    (l) => new URL(this.browser.baseURI()).pathname === `/${l.code}/`,
  );

  /** The language this build is in. */
  readonly current: AppLocale['code'] = this.localeId.startsWith('nl') ? 'nl' : 'en';

  /** The same page in another language: `/nl/gardens/3` for `/en/gardens/3`. */
  hrefFor(code: AppLocale['code']): string {
    return `/${code}${this.url()}`;
  }

  /** Remembers the choice (the site root redirects by it) and loads that build. */
  switchTo(code: AppLocale['code']): void {
    this.browser.setCookie(`lang=${code}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`);
    this.browser.assign(this.hrefFor(code));
  }
}
