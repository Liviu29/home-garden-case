import { DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { UsersApi } from '../api/users-api';
import type { UserProfile } from '../api/models';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { ApiError } from '../errors/api-error';
import { ToastStore } from '../errors/toast-store';
import { ThemeStore } from '../config/theme-store';
import { SessionStore } from '../auth/session-store';
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
  age: 33,
};

describe('Shell', () => {
  let usersApi: { getById: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  let router: Router;
  let session: SessionStore;
  let toasts: ToastStore;

  const render = (signedIn = true, deferBlockBehavior = DeferBlockBehavior.Playthrough) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      deferBlockBehavior,
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: APP_CONFIG, useValue: CONFIG },
        { provide: UsersApi, useValue: usersApi },
      ],
    });
    session = TestBed.inject(SessionStore);
    router = TestBed.inject(Router);
    toasts = TestBed.inject(ToastStore);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    if (signedIn) {
      session.signIn(PROFILE);
    }
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    localStorage.clear();
    usersApi = {
      getById: vi.fn().mockResolvedValue(PROFILE),
      delete: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('chrome', () => {
    it('renders brand, primary navigation and the profile name', () => {
      const el = render().nativeElement as HTMLElement;
      expect(el.textContent).toContain('Dashboard');
      expect(el.textContent).toContain('Gardens');
      expect(el.textContent).toContain('Liviu Nita');
    });

    it('exposes an accessible home link', () => {
      const el = render().nativeElement as HTMLElement;
      expect(el.querySelector('.brand')?.getAttribute('aria-label')).toBe('ItpHomeGarden home');
    });

    it('ends every page with the case brief’s garden — decorative and lazy', () => {
      const el = render().nativeElement as HTMLElement;
      const backdrop = el.querySelector('.page-backdrop')!;
      expect(backdrop.getAttribute('aria-hidden')).toBe('true');
      expect(backdrop.previousElementSibling?.tagName).toBe('MAIN'); // after the content
      const img = backdrop.querySelector('img')!;
      expect(img.getAttribute('src')).toContain('garden-backdrop-1600.webp');
      expect(img.getAttribute('srcset')).toContain('garden-backdrop-800.webp 800w');
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.getAttribute('alt')).toBe('');
    });

    it('the theme toggle flips the theme', () => {
      const fixture = render();
      const el = fixture.nativeElement as HTMLElement;
      const theme = TestBed.inject(ThemeStore);
      const before = theme.isDark();

      el.querySelector<HTMLButtonElement>('.theme-toggle')?.click();
      fixture.detectChanges();

      expect(theme.isDark()).toBe(!before);
    });
  });

  describe('the account menu is deferred (Material stays out of the eager bundle)', () => {
    it('paints the chip at once as a placeholder, then the menu takes its place', async () => {
      const fixture = render(true, DeferBlockBehavior.Manual);
      const el = fixture.nativeElement as HTMLElement;
      const [block] = await fixture.getDeferBlocks();

      await block.render(DeferBlockState.Placeholder);
      const placeholder = el.querySelector('[data-testid="account-menu-placeholder"]');
      expect(placeholder?.textContent).toContain('LN');
      expect(placeholder?.textContent).toContain('Liviu Nita');
      expect(placeholder?.getAttribute('aria-hidden')).toBe('true'); // not a control yet
      expect(el.querySelector('[aria-haspopup="menu"]')).toBeNull();

      await block.render(DeferBlockState.Complete);
      expect(el.querySelector('[data-testid="account-menu-placeholder"]')).toBeNull();
      const trigger = el.querySelector('button.profile[aria-haspopup="menu"]');
      expect(trigger?.textContent).toContain('Liviu Nita');
    });

    it('arrives on its own once the browser is idle', async () => {
      const fixture = render();
      const el = fixture.nativeElement as HTMLElement;
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(el.querySelector('button.profile[aria-haspopup="menu"]')).not.toBeNull();
      });
    });
  });

  describe('session revalidation on boot', () => {
    it('keeps the user in place when the profile still exists', async () => {
      render();
      await vi.waitFor(() => expect(usersApi.getById).toHaveBeenCalledWith(1));
      expect(router.navigate).not.toHaveBeenCalled();
      expect(session.isActive()).toBe(true);
    });

    it('bounces to onboarding with an explanation when the profile is gone (404)', async () => {
      usersApi.getById.mockRejectedValue(new ApiError('not-found', 'gone', 404));
      render();

      await vi.waitFor(() => expect(router.navigate).toHaveBeenCalledWith(['/welcome']));
      expect(toasts.toasts()[0].message).toContain('no longer exists');
      expect(session.isActive()).toBe(false);
    });

    it('does NOT sign out on a transient 500 — that would eject 10% of visits', async () => {
      usersApi.getById.mockRejectedValue(new ApiError('technical', 'boom', 500));
      render();

      await vi.waitFor(() => expect(usersApi.getById).toHaveBeenCalled());
      expect(router.navigate).not.toHaveBeenCalled();
      expect(session.isActive()).toBe(true);
    });
  });
});
