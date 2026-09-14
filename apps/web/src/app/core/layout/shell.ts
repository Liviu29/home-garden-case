import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionStore } from '../auth/session-store';
import { ThemeStore } from '../config/theme-store';
import { ToastStore } from '../errors/toast-store';
import { Locales } from '../i18n/locales';
import { ToastHost } from '../../shared/ui/toast/toast-host';
import { AccountMenu } from './account-menu/account-menu';

/**
 * App shell: blurred topbar, animated active nav underline, profile menu.
 *
 * The shell is in the eager bundle, so it imports no Material: the account
 * menu (Material's menu and the CDK overlay behind it) is a `@defer (on
 * idle)` block whose placeholder is the same chip, painted at once.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastHost, AccountMenu],
  template: `
    <div class="shell">
      <a class="skip-link" href="#main-content" i18n>Skip to content</a>
      <header class="topbar">
        <a routerLink="/" class="brand" aria-label="ItpHomeGarden home" i18n-aria-label>
          <span class="mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M12 21 V11 M12 13 C12 8 8 6.5 4.5 7 C5 11.5 8.5 13.6 12 13 Z M12 11 C12 6.5 15.5 4.5 19.5 5 C19 10 15.5 12 12 11 Z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
          </span>
          <span class="name">HomeGarden</span>
        </a>

        <nav class="nav" aria-label="Primary" i18n-aria-label>
          <a routerLink="/dashboard" routerLinkActive="active" i18n>Dashboard</a>
          <a routerLink="/gardens" routerLinkActive="active" i18n>Gardens</a>
        </nav>

        <!-- Each language is its own build (/en/, /nl/); a dev server has one -->
        @if (locales.localized) {
          <nav class="lang" aria-label="Language" i18n-aria-label>
            @for (locale of locales.all; track locale.code) {
              <a
                [href]="locales.hrefFor(locale.code)"
                [attr.hreflang]="locale.code"
                [attr.lang]="locale.code"
                [attr.aria-label]="locale.name"
                [attr.aria-current]="locale.code === locales.current ? 'true' : null"
                (click)="switchLanguage($event, locale.code)"
                >{{ locale.label }}</a
              >
            }
          </nav>
        }

        <button
          class="theme-toggle press-feedback"
          type="button"
          (click)="theme.toggle()"
          [attr.aria-label]="themeLabel()"
        >
          @if (theme.isDark()) {
            <svg
              viewBox="0 0 24 24"
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4" />
              <path
                d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
              />
            </svg>
          } @else {
            <svg
              viewBox="0 0 24 24"
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z" />
            </svg>
          }
        </button>

        <!-- The menu's chunk (Material menu + CDK overlay) loads once the
             browser is idle after first paint; until then the chip is drawn
             as-is, so nothing moves when the menu takes its place. -->
        @defer (on idle) {
          <app-account-menu />
        } @placeholder {
          <span class="profile" data-testid="account-menu-placeholder" aria-hidden="true">
            <span class="avatar">{{ session.initials() }}</span>
            <span class="profile-name">{{ session.displayName() }}</span>
          </span>
        }
      </header>

      <main class="content" id="main-content" tabindex="-1">
        <router-outlet />
      </main>

      <!-- Every page ends in the case brief's own garden: a decorative photo
           rising out of the page on a gradient mask (fixed height, lazy — it
           never shifts anything and costs nothing until scrolled near). -->
      <div class="page-backdrop" aria-hidden="true">
        <img
          src="images/garden-backdrop-1600.webp"
          srcset="images/garden-backdrop-800.webp 800w, images/garden-backdrop-1600.webp 1600w"
          sizes="100vw"
          alt=""
          width="1600"
          height="800"
          loading="lazy"
          decoding="async"
        />
      </div>

      <app-toast-host />
    </div>
  `,
  styleUrl: './shell.scss',
})
export class Shell {
  protected readonly session = inject(SessionStore);
  protected readonly theme = inject(ThemeStore);
  protected readonly locales = inject(Locales);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastStore);

  protected readonly themeLabel = computed(() =>
    this.theme.isDark() ? $localize`Switch to light theme` : $localize`Switch to dark theme`,
  );

  constructor() {
    // The persisted session can outlive the profile it points at (deleted
    // elsewhere, or db.sqlite reset). A 404 signs out; a random 500 does not.
    void this.session.revalidate().then((valid) => {
      if (!valid) {
        this.toasts.error($localize`That profile no longer exists. Please choose another.`);
        void this.router.navigate(['/welcome']);
      }
    });
  }

  /** The switcher's links work without script too; with it, the route is kept. */
  protected switchLanguage(event: Event, code: 'en' | 'nl'): void {
    event.preventDefault();
    this.locales.switchTo(code);
  }
}
