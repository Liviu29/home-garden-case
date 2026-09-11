import { MatDialog } from '@angular/material/dialog';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { UsersApi } from '../api/users-api';
import { UserProfile } from '../api/models';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { ApiError } from '../errors/api-error';
import { ToastStore } from '../errors/toast-store';
import { QueryCache, cacheKeys } from '../resilience/query-cache';
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

/** Reach the protected members the template binds to. */
type ShellApi = {
  deleting: () => boolean;
  deleteProfile: () => Promise<void>;
  switchProfile: () => void;
  signOut: () => void;
};

describe('Shell', () => {
  let usersApi: { getById: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  let router: Router;
  let session: SessionStore;
  let toasts: ToastStore;
  let cache: QueryCache;

  const render = (signedIn = true) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
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
    cache = TestBed.inject(QueryCache);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    if (signedIn) {
      session.signIn(PROFILE);
    }
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    return fixture;
  };

  const api = (fixture: { componentInstance: unknown }): ShellApi =>
    fixture.componentInstance as ShellApi;

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

  describe('profile menu actions', () => {
    it('switching profile returns to onboarding without ending the session', () => {
      const fixture = render();
      api(fixture).switchProfile();
      expect(router.navigate).toHaveBeenCalledWith(['/welcome']);
      expect(session.isActive()).toBe(true);
    });

    it('signing out ends the session and returns to onboarding', () => {
      const fixture = render();
      api(fixture).signOut();
      expect(session.isActive()).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith(['/welcome']);
    });
  });

  describe('deleteProfile', () => {
    const confirmWith = async (result: boolean) => {
      const { ConfirmService } = await import('../../shared/ui/confirm-dialog/confirm-dialog');
      vi.spyOn(TestBed.inject(ConfirmService), 'confirm').mockResolvedValue(result);
    };

    it('does nothing when there is no profile', async () => {
      const fixture = render(false);
      await api(fixture).deleteProfile();
      expect(usersApi.delete).not.toHaveBeenCalled();
    });

    it('does nothing when a delete is already in flight (re-entrancy guard)', async () => {
      const fixture = render();
      await confirmWith(true);
      let release = (): void => undefined;
      usersApi.delete.mockImplementation(() => new Promise<void>((r) => (release = () => r())));

      const first = api(fixture).deleteProfile();
      await vi.waitFor(() => expect(api(fixture).deleting()).toBe(true));
      await api(fixture).deleteProfile(); // second click while pending

      release();
      await first;
      expect(usersApi.delete).toHaveBeenCalledTimes(1);
    });

    it('ghosts the profile chip while the delete is in flight — inert and announced', async () => {
      const fixture = render();
      await confirmWith(true);
      let release = (): void => undefined;
      usersApi.delete.mockImplementation(() => new Promise<void>((r) => (release = () => r())));

      const pending = api(fixture).deleteProfile();
      await vi.waitFor(() => expect(api(fixture).deleting()).toBe(true));
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const chip = el.querySelector('button.profile');
      expect(chip?.classList).toContain('mutation-ghost');
      expect(chip?.getAttribute('aria-busy')).toBe('true');
      expect(chip?.hasAttribute('inert')).toBe(true);
      expect(el.textContent).toContain('Deleting profile…');

      release();
      await pending;
    });

    it('aborts when the confirmation is declined', async () => {
      const fixture = render();
      await confirmWith(false);
      await api(fixture).deleteProfile();
      expect(usersApi.delete).not.toHaveBeenCalled();
      expect(session.isActive()).toBe(true);
    });

    it('deletes, invalidates the users cache, signs out and confirms', async () => {
      const fixture = render();
      await confirmWith(true);
      const invalidate = vi.spyOn(cache, 'invalidate');

      await api(fixture).deleteProfile();

      expect(usersApi.delete).toHaveBeenCalledWith(1);
      expect(invalidate).toHaveBeenCalledWith(cacheKeys.users);
      expect(session.isActive()).toBe(false);
      expect(toasts.toasts().some((t) => t.message === 'Profile deleted.')).toBe(true);
      expect(router.navigate).toHaveBeenCalledWith(['/welcome']);
    });

    it('RECONCILES a 404 instead of erroring — the profile is already gone', async () => {
      const fixture = render();
      await confirmWith(true);
      usersApi.delete.mockRejectedValue(new ApiError('not-found', 'gone', 404));

      await api(fixture).deleteProfile();

      expect(session.isActive()).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith(['/welcome']);
      expect(toasts.toasts().every((t) => t.tone !== 'error')).toBe(true);
    });

    it('keeps the session and explains when the delete genuinely fails', async () => {
      const fixture = render();
      await confirmWith(true);
      usersApi.delete.mockRejectedValue(new ApiError('technical', 'Server exploded', 500));

      await api(fixture).deleteProfile();

      expect(session.isActive()).toBe(true);
      expect(toasts.toasts().some((t) => t.message.includes("Couldn't delete the profile"))).toBe(
        true,
      );
      expect(api(fixture).deleting()).toBe(false); // guard released
    });

    it('does not claim gardens are removed — this backend does not own them', async () => {
      const fixture = render();
      const { ConfirmService } = await import('../../shared/ui/confirm-dialog/confirm-dialog');
      const confirm = vi.spyOn(TestBed.inject(ConfirmService), 'confirm').mockResolvedValue(false);

      await api(fixture).deleteProfile();

      const message = confirm.mock.calls[0][0].message;
      expect(message).toContain('shared with every profile');
      expect(message).not.toMatch(/gardens? (and plants? )?will be (deleted|removed)/i);
    });
  });

  describe('menu wiring (driven through the DOM)', () => {
    const openMenu = (fixture: { detectChanges: () => void }, el: HTMLElement) => {
      el.querySelector<HTMLButtonElement>(
        '[aria-haspopup="menu"], .profile-trigger, button.avatar',
      )?.click();
      fixture.detectChanges();
      return [...document.querySelectorAll<HTMLButtonElement>('button.mat-mdc-menu-item')];
    };

    it('the theme toggle flips the theme', () => {
      const fixture = render();
      const el = fixture.nativeElement as HTMLElement;
      const theme = TestBed.inject(ThemeStore);
      const before = theme.isDark();

      el.querySelector<HTMLButtonElement>('.theme-toggle')?.click();
      fixture.detectChanges();

      expect(theme.isDark()).toBe(!before);
    });

    it('Edit profile lazily loads and opens the profile dialog', async () => {
      const fixture = render();
      const el = fixture.nativeElement as HTMLElement;
      const items = openMenu(fixture, el);

      const edit = items.find((b) => /edit profile/i.test(b.textContent ?? ''));
      expect(edit, 'Edit profile menu item').toBeDefined();
      edit!.click();

      // `editProfile()` dynamically imports ProfileDialog AND MatDialog before
      // opening. The test must wait for the dialog to actually appear —
      // finishing earlier tears the injector down mid-import and the pending
      // `injector.get(MatDialog)` then rejects with NG0205.
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(document.querySelector('mat-dialog-container')).not.toBeNull();
      });

      TestBed.inject(MatDialog).closeAll();
      fixture.detectChanges();
    });

    it('Switch profile returns to onboarding without ending the session', () => {
      const fixture = render();
      const el = fixture.nativeElement as HTMLElement;
      const items = openMenu(fixture, el);

      items.find((b) => /switch profile/i.test(b.textContent ?? ''))!.click();

      expect(router.navigate).toHaveBeenCalledWith(['/welcome']);
      expect(session.isActive()).toBe(true);
    });

    it('Sign out ends the session', () => {
      const fixture = render();
      const el = fixture.nativeElement as HTMLElement;
      const items = openMenu(fixture, el);

      items.find((b) => /sign out/i.test(b.textContent ?? ''))!.click();

      expect(session.isActive()).toBe(false);
    });

    it('Delete profile asks for confirmation first', async () => {
      const fixture = render();
      const el = fixture.nativeElement as HTMLElement;
      const { ConfirmService } = await import('../../shared/ui/confirm-dialog/confirm-dialog');
      const confirm = vi.spyOn(TestBed.inject(ConfirmService), 'confirm').mockResolvedValue(false);

      const items = openMenu(fixture, el);
      items.find((b) => /delete profile/i.test(b.textContent ?? ''))!.click();
      await new Promise((r) => setTimeout(r, 0));

      expect(confirm).toHaveBeenCalled();
      expect(usersApi.delete).not.toHaveBeenCalled();
    });
  });
});
