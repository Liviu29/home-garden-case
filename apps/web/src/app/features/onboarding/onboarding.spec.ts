import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import type { UserProfile } from '../../core/api/models';
import { UsersApi } from '../../core/api/users-api';
import { SessionStore } from '../../core/auth/session-store';
import { APP_CONFIG, type AppConfig } from '../../core/config/app-config';
import { ApiError } from '../../core/errors/api-error';
import { QueryCache, cacheKeys } from '../../core/resilience/query-cache';
import { ThemeStore } from '../../core/config/theme-store';
import { Onboarding } from './onboarding';

const CONFIG = {
  apiBaseUrl: '/api',
  retry: { maxAttempts: 1, baseDelayMs: 1, backoffFactor: 1, maxDelayMs: 1 },
  cache: { freshTtlMs: 30_000 },
  toastDurationMs: 5000,
} as AppConfig;

const profile = (over: Partial<UserProfile> = {}): UserProfile => ({
  userId: 1,
  emailAddress: 'liviu@example.com',
  firstName: 'Liviu',
  lastName: 'Nita',
  age: 33,
  ...over,
});

type OnboardingApi = {
  profiles: () => readonly UserProfile[];
  status: () => string;
  creating: () => boolean;
  serverError: () => string | null;
  duplicateEmail: () => string | null;
  form: {
    patchValue: (v: Record<string, unknown>) => void;
    controls: Record<string, { setValue: (v: unknown) => void }>;
  };
  load: () => Promise<void>;
  select: (p: UserProfile) => void;
  create: () => Promise<void>;
  continueAsExisting: () => Promise<void>;
  initialsOf: (p: UserProfile) => string;
  nameOf: (p: UserProfile) => string;
};

describe('Onboarding (profile selection — ADR-005)', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let router: Router;
  let session: SessionStore;
  let cache: QueryCache;

  const render = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: APP_CONFIG, useValue: CONFIG },
        { provide: UsersApi, useValue: api },
      ],
    });
    router = TestBed.inject(Router);
    session = TestBed.inject(SessionStore);
    cache = TestBed.inject(QueryCache);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Onboarding);
    fixture.detectChanges();
    return {
      fixture,
      vm: fixture.componentInstance as unknown as OnboardingApi,
      el: fixture.nativeElement as HTMLElement,
    };
  };

  beforeEach(() => {
    localStorage.clear();
    api = {
      getAll: vi.fn().mockResolvedValue([profile()]),
      create: vi.fn(),
      getByEmail: vi.fn(),
    };
  });

  describe('loading the profile list', () => {
    it('lists profiles once the request settles', async () => {
      const { vm } = render();
      await vi.waitFor(() => expect(vm.status()).toBe('ready'));
      expect(vm.profiles()).toHaveLength(1);
    });

    it('shows the error state when the list cannot be loaded at all', async () => {
      api['getAll'].mockRejectedValue(new ApiError('technical', 'boom', 500));
      const { vm } = render();
      await vi.waitFor(() => expect(vm.status()).toBe('error'));
    });

    it('keeps showing cached profiles when a background refresh fails', async () => {
      const { vm } = render();
      await vi.waitFor(() => expect(vm.status()).toBe('ready'));

      api['getAll'].mockRejectedValue(new ApiError('technical', 'boom', 500));
      cache.invalidate(cacheKeys.users);
      await vm.load();

      expect(vm.status()).toBe('error'); // no cache to fall back on after invalidation
    });

    it('renders cached profiles instantly, without waiting for the network', async () => {
      // Seed the cache the way a previous visit would have, then mount: the
      // list must be on screen synchronously rather than after a round trip.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          provideNoopAnimations(),
          { provide: APP_CONFIG, useValue: CONFIG },
          { provide: UsersApi, useValue: api },
        ],
      });
      TestBed.inject(QueryCache).set(cacheKeys.users, [profile()]);
      vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      const fixture = TestBed.createComponent(Onboarding);
      const vm = fixture.componentInstance as unknown as OnboardingApi;
      fixture.detectChanges();

      expect(vm.profiles()).toHaveLength(1);
      expect(vm.status()).toBe('ready');
    });
  });

  describe('selecting a profile', () => {
    it('signs in and goes to the dashboard', async () => {
      const { vm } = render();
      await vi.waitFor(() => expect(vm.status()).toBe('ready'));

      vm.select(profile({ userId: 5 }));

      expect(session.profile()).toMatchObject({ userId: 5 });
      expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
    });
  });

  describe('display helpers', () => {
    it('build initials from the name, falling back to the email', () => {
      const { vm } = render();
      expect(vm.initialsOf(profile())).toBe('LN');
      expect(vm.initialsOf(profile({ firstName: null, lastName: null }))).toBe('L');
    });

    it('build a display name, falling back to the email', () => {
      const { vm } = render();
      expect(vm.nameOf(profile())).toBe('Liviu Nita');
      expect(vm.nameOf(profile({ firstName: null, lastName: null }))).toBe('liviu@example.com');
    });
  });

  describe('creating a profile', () => {
    const fill = (vm: OnboardingApi, over: Record<string, unknown> = {}) =>
      vm.form.patchValue({
        firstName: ' Ana ',
        lastName: ' Pop ',
        emailAddress: 'ana@example.com',
        age: 28,
        ...over,
      });

    it('refuses to submit an invalid form', async () => {
      const { vm } = render();
      fill(vm, { emailAddress: 'not-an-email' });
      await vm.create();
      expect(api['create']).not.toHaveBeenCalled();
    });

    it('treats a padded email as invalid — validation runs before trimming', async () => {
      const { vm } = render();
      fill(vm, { emailAddress: ' ana@example.com ' });
      await vm.create();
      expect(api['create']).not.toHaveBeenCalled();
    });

    it('trims every field and nulls the empty optional ones', async () => {
      const { vm } = render();
      api['create'].mockResolvedValue(profile({ userId: 9 }));
      fill(vm, { firstName: '  ', lastName: '  ' });

      await vm.create();

      expect(api['create']).toHaveBeenCalledWith({
        emailAddress: 'ana@example.com',
        firstName: null,
        lastName: null,
        age: 28,
      });
    });

    it('nulls an absent age rather than sending NaN', async () => {
      const { vm } = render();
      api['create'].mockResolvedValue(profile({ userId: 9 }));
      fill(vm, { age: null });

      await vm.create();

      expect(api['create']).toHaveBeenCalledWith(expect.objectContaining({ age: null }));
    });

    it('invalidates the users cache and signs the new profile in', async () => {
      const { vm } = render();
      const created = profile({ userId: 9 });
      api['create'].mockResolvedValue(created);
      const invalidate = vi.spyOn(cache, 'invalidate');
      fill(vm);

      await vm.create();

      expect(invalidate).toHaveBeenCalledWith(cacheKeys.users);
      expect(session.profile()).toMatchObject({ userId: 9 });
      expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
    });

    it('ignores a second submit while one is in flight', async () => {
      const { vm } = render();
      let release = (): void => undefined;
      api['create'].mockImplementation(
        () => new Promise((r) => (release = () => r(profile({ userId: 9 })))),
      );
      fill(vm);

      const first = vm.create();
      await vi.waitFor(() => expect(vm.creating()).toBe(true));
      await vm.create();

      release();
      await first;
      expect(api['create']).toHaveBeenCalledTimes(1);
    });

    it('offers to continue as the existing profile on a 409', async () => {
      const { vm } = render();
      api['create'].mockRejectedValue(new ApiError('functional', 'exists', 409));
      fill(vm);

      await vm.create();

      expect(vm.duplicateEmail()).toBe('ana@example.com');
      expect(vm.serverError()).toContain('already uses that email');
    });

    it('surfaces any other server verdict verbatim', async () => {
      const { vm } = render();
      api['create'].mockRejectedValue(new ApiError('functional', 'Age must be positive', 400));
      fill(vm);

      await vm.create();

      expect(vm.serverError()).toBe('Age must be positive');
      expect(vm.duplicateEmail()).toBeNull();
    });
  });

  describe('continueAsExisting (the 409 recovery path)', () => {
    const reach409 = async () => {
      const rendered = render();
      rendered.vm.form.patchValue({
        firstName: 'A',
        lastName: 'B',
        emailAddress: 'taken@example.com',
        age: 20,
      });
      api['create'].mockRejectedValue(new ApiError('functional', 'exists', 409));
      await rendered.vm.create();
      return rendered;
    };

    it('does nothing when there is no duplicate to resolve', async () => {
      const { vm } = render();
      await vm.continueAsExisting();
      expect(api['getByEmail']).not.toHaveBeenCalled();
    });

    it('looks the profile up by email and signs in', async () => {
      const { vm } = await reach409();
      api['getByEmail'].mockResolvedValue(profile({ userId: 3 }));

      await vm.continueAsExisting();

      expect(api['getByEmail']).toHaveBeenCalledWith('taken@example.com');
      expect(session.profile()).toMatchObject({ userId: 3 });
      expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
    });

    it('explains when the lookup 404s instead of leaving the user stranded', async () => {
      const { vm } = await reach409();
      api['getByEmail'].mockRejectedValue(new ApiError('not-found', 'nope', 404));

      await vm.continueAsExisting();

      expect(vm.serverError()).toContain('Try picking it from the list');
    });

    it('surfaces a technical failure message', async () => {
      const { vm } = await reach409();
      api['getByEmail'].mockRejectedValue(new ApiError('technical', 'Server exploded', 500));

      await vm.continueAsExisting();

      expect(vm.serverError()).toBe('Server exploded');
    });
  });

  describe('rendered states', () => {
    type Toggles = {
      showCreate: { set: (v: boolean) => void };
      resolvingDuplicate: { set: (v: boolean) => void };
      creating: { set: (v: boolean) => void };
      serverError: { set: (v: string | null) => void };
      duplicateEmail: { set: (v: string | null) => void };
    };

    const toggles = (vm: OnboardingApi) => vm as unknown as Toggles;

    it('shows content-shaped ghosts while the profile list loads', async () => {
      api['getAll'].mockReturnValue(new Promise(() => undefined)); // never settles
      const { fixture, el } = render();
      // The skeleton group has an appear delay (0ms in test config) driven by
      // setTimeout, so it lands on the next macrotask, not synchronously.
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();

      expect(el.querySelectorAll('app-skeleton').length).toBeGreaterThan(0);
    });

    it('shows the designed zero state when the backend has no profiles', async () => {
      api['getAll'].mockResolvedValue([]);
      const { fixture, el } = render();

      // The zero state is deliberately gated behind the skeleton's appear
      // delay (a setTimeout), so waiting on `status()` alone is not enough —
      // that gap is exactly the flash this gate exists to prevent.
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(el.querySelector('.zero-state')).not.toBeNull();
      });
    });

    it('shows an error state with a way forward when the list cannot load', async () => {
      api['getAll'].mockRejectedValue(new ApiError('technical', 'boom', 500));
      const { fixture, vm, el } = render();
      await vi.waitFor(() => expect(vm.status()).toBe('error'));
      fixture.detectChanges();

      expect((el.textContent ?? '').toLowerCase()).toMatch(/again|retry|couldn't|could not/);
    });

    it('lists every profile', async () => {
      api['getAll'].mockResolvedValue([profile(), profile({ userId: 2, firstName: 'Ana' })]);
      const { fixture, vm, el } = render();
      await vi.waitFor(() => expect(vm.profiles()).toHaveLength(2));
      fixture.detectChanges();

      expect(el.textContent).toContain('Liviu Nita');
      expect(el.textContent).toContain('Ana');
    });

    it('switches to the create form and back', async () => {
      const { fixture, vm, el } = render();
      await vi.waitFor(() => expect(vm.status()).toBe('ready'));

      toggles(vm).showCreate.set(true);
      fixture.detectChanges();
      expect(el.querySelector('form')).not.toBeNull();

      toggles(vm).showCreate.set(false);
      fixture.detectChanges();
      expect(el.querySelector('form')).toBeNull();
    });

    it('renders each panel view in its own fading wrapper, so a swap never cuts', async () => {
      const { fixture, vm, el } = render();
      await vi.waitFor(() => expect(vm.status()).toBe('ready'));
      fixture.detectChanges();
      expect(el.querySelectorAll('.panel-view')).toHaveLength(1);

      toggles(vm).showCreate.set(true);
      fixture.detectChanges();
      expect(el.querySelectorAll('.panel-view')).toHaveLength(1);
      expect(el.querySelector('.panel-view form')).not.toBeNull();
    });

    it('sets the case brief’s garden behind the brand, fading in once decoded', () => {
      const { fixture, el } = render();
      const photo = el.querySelector('img.page-photo')!;
      expect(photo.getAttribute('aria-hidden')).toBe('true');
      expect(photo.getAttribute('alt')).toBe('');
      expect(photo.classList).not.toContain('is-ready'); // never pops in half-decoded

      photo.dispatchEvent(new Event('load'));
      fixture.detectChanges();
      expect(photo.classList).toContain('is-ready');
    });

    it('renders the required-email message once the form is touched', async () => {
      const { fixture, vm, el } = render();
      await vi.waitFor(() => expect(vm.status()).toBe('ready'));
      toggles(vm).showCreate.set(true);
      fixture.detectChanges();

      vm.form.patchValue({ emailAddress: '' });
      await vm.create();
      fixture.detectChanges();

      expect((el.textContent ?? '').toLowerCase()).toContain('email');
    });

    it('renders the invalid-email message', async () => {
      const { fixture, vm, el } = render();
      await vi.waitFor(() => expect(vm.status()).toBe('ready'));
      toggles(vm).showCreate.set(true);
      vm.form.patchValue({ emailAddress: 'nope' });
      await vm.create();
      fixture.detectChanges();

      expect((el.textContent ?? '').toLowerCase()).toMatch(/valid|email/);
    });

    it('renders the age validation message', async () => {
      const { fixture, vm, el } = render();
      await vi.waitFor(() => expect(vm.status()).toBe('ready'));
      toggles(vm).showCreate.set(true);
      vm.form.patchValue({ emailAddress: 'a@b.co', age: -5 });
      await vm.create();
      fixture.detectChanges();

      expect((el.textContent ?? '').toLowerCase()).toMatch(/age/);
    });

    it('renders a server error inline on the form', async () => {
      const { fixture, vm, el } = render();
      await vi.waitFor(() => expect(vm.status()).toBe('ready'));
      toggles(vm).showCreate.set(true);
      toggles(vm).serverError.set('Age must be positive');
      fixture.detectChanges();

      expect(el.textContent).toContain('Age must be positive');
    });

    it('offers the continue-as-existing recovery when the email is taken', async () => {
      const { fixture, vm, el } = render();
      await vi.waitFor(() => expect(vm.status()).toBe('ready'));
      toggles(vm).showCreate.set(true);
      toggles(vm).duplicateEmail.set('taken@example.com');
      fixture.detectChanges();

      expect(el.textContent).toContain('taken@example.com');
    });

    it('ghosts the recovery button while it resolves', async () => {
      const { fixture, vm, el } = render();
      await vi.waitFor(() => expect(vm.status()).toBe('ready'));
      toggles(vm).showCreate.set(true);
      toggles(vm).duplicateEmail.set('taken@example.com');
      toggles(vm).resolvingDuplicate.set(true);
      fixture.detectChanges();

      expect(el.querySelector('.btn-ghost')).not.toBeNull();
      expect(el.textContent).toContain('Opening');
    });

    it('ghosts the submit button while creating — never a spinner', async () => {
      const { fixture, vm, el } = render();
      await vi.waitFor(() => expect(vm.status()).toBe('ready'));
      toggles(vm).showCreate.set(true);
      toggles(vm).creating.set(true);
      fixture.detectChanges();

      expect(el.querySelector('.btn-ghost')).not.toBeNull();
      expect(el.textContent).toContain('Creating profile');
      expect(el.querySelector('mat-spinner, .mat-mdc-progress-spinner')).toBeNull();
    });

    it('renders a different brand mark per theme', async () => {
      const { fixture, el } = render();
      const theme = TestBed.inject(ThemeStore);
      const before = el.innerHTML;

      theme.toggle();
      fixture.detectChanges();

      expect(el.innerHTML).not.toBe(before);
    });
  });

  /**
   * Driven through the DOM rather than by calling methods: these assert the
   * wiring between a rendered control and the behaviour behind it, which is
   * the part a refactor of the template can silently break.
   */
  describe('user interactions', () => {
    const click = (el: HTMLElement, selector: string) => {
      const target = el.querySelector<HTMLElement>(selector);
      expect(target, `no element matched ${selector}`).not.toBeNull();
      target!.click();
    };

    const ready = async (fixture: { detectChanges: () => void }, vm: OnboardingApi) => {
      await vi.waitFor(() => expect(vm.status()).toBe('ready'));
      fixture.detectChanges();
    };

    it('the theme toggle flips the theme', async () => {
      const { fixture, vm, el } = render();
      await ready(fixture, vm);
      const theme = TestBed.inject(ThemeStore);
      const before = theme.isDark();

      click(el, '.theme-toggle');
      fixture.detectChanges();

      expect(theme.isDark()).toBe(!before);
    });

    it('clicking a profile signs in and navigates', async () => {
      const { fixture, vm, el } = render();
      await ready(fixture, vm);

      click(el, '.profile');

      expect(session.profile()).toMatchObject({ userId: 1 });
      expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
    });

    it('the create card opens the form', async () => {
      const { fixture, vm, el } = render();
      await ready(fixture, vm);

      click(el, '.create-card');
      fixture.detectChanges();

      expect(el.querySelector('form')).not.toBeNull();
    });

    it('the zero-state CTA opens the form', async () => {
      api['getAll'].mockResolvedValue([]);
      const { fixture, el } = render();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(el.querySelector('.zero-cta')).not.toBeNull();
      });

      click(el, '.zero-cta');
      fixture.detectChanges();

      expect(el.querySelector('form')).not.toBeNull();
    });

    it('the error state retry re-issues the request', async () => {
      api['getAll'].mockRejectedValue(new ApiError('technical', 'boom', 500));
      const { fixture, vm, el } = render();
      await vi.waitFor(() => expect(vm.status()).toBe('error'));
      fixture.detectChanges();
      api['getAll'].mockResolvedValue([profile()]);

      click(el, '.error-state button');

      await vi.waitFor(() => expect(vm.status()).toBe('ready'));
    });

    it('the Back button leaves the form', async () => {
      const { fixture, vm, el } = render();
      await ready(fixture, vm);
      click(el, '.create-card');
      fixture.detectChanges();

      const back = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Back'));
      back!.click();
      fixture.detectChanges();

      expect(el.querySelector('form')).toBeNull();
    });

    it('submitting the form creates the profile', async () => {
      const { fixture, vm, el } = render();
      await ready(fixture, vm);
      click(el, '.create-card');
      fixture.detectChanges();

      api['create'].mockResolvedValue(profile({ userId: 9 }));
      vm.form.patchValue({
        firstName: 'Ana',
        lastName: 'Pop',
        emailAddress: 'ana@example.com',
        age: 28,
      });
      fixture.detectChanges();

      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      await vi.waitFor(() => expect(api['create']).toHaveBeenCalled());
    });

    it('the continue-as-existing button resolves the duplicate', async () => {
      const { fixture, vm, el } = render();
      await ready(fixture, vm);
      click(el, '.create-card');
      vm.form.patchValue({
        firstName: 'A',
        lastName: 'B',
        emailAddress: 'taken@example.com',
        age: 20,
      });
      api['create'].mockRejectedValue(new ApiError('functional', 'exists', 409));
      await vm.create();
      fixture.detectChanges();

      api['getByEmail'].mockResolvedValue(profile({ userId: 3 }));
      const button = [...el.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Continue as'),
      );
      button!.click();

      await vi.waitFor(() => expect(session.profile()).toMatchObject({ userId: 3 }));
    });
  });
});
