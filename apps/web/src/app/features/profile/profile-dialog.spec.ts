import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import type { UserProfile } from '../../core/api/models';
import { UsersApi } from '../../core/api/users-api';
import { SessionStore } from '../../core/auth/session-store';
import { APP_CONFIG, type AppConfig } from '../../core/config/app-config';
import { ApiError } from '../../core/errors/api-error';
import { ToastStore } from '../../core/errors/toast-store';
import { QueryCache, cacheKeys } from '../../core/resilience/query-cache';
import { ProfileDialog } from './profile-dialog';

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

type DialogApi = {
  saving: () => boolean;
  serverError: () => string | null;
  form: { patchValue: (v: Record<string, unknown>) => void };
  submit: () => Promise<void>;
};

describe('ProfileDialog (PUT /users/:id)', () => {
  let api: { update: ReturnType<typeof vi.fn> };
  let ref: { close: ReturnType<typeof vi.fn> };
  let session: SessionStore;
  let toasts: ToastStore;
  let cache: QueryCache;

  const render = (signedIn = true) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideNoopAnimations(),
        { provide: APP_CONFIG, useValue: CONFIG },
        { provide: UsersApi, useValue: api },
        { provide: MatDialogRef, useValue: ref },
      ],
    });
    session = TestBed.inject(SessionStore);
    toasts = TestBed.inject(ToastStore);
    cache = TestBed.inject(QueryCache);
    if (signedIn) {
      session.signIn(PROFILE);
    }
    const fixture = TestBed.createComponent(ProfileDialog);
    fixture.detectChanges();
    return { fixture, vm: fixture.componentInstance as unknown as DialogApi };
  };

  beforeEach(() => {
    localStorage.clear();
    api = { update: vi.fn().mockResolvedValue({ ...PROFILE, firstName: 'Server' }) };
    ref = { close: vi.fn() };
  });

  it('pre-fills the form from the active session', () => {
    const { fixture } = render();
    const el = fixture.nativeElement as HTMLElement;
    const email = el.querySelector<HTMLInputElement>('input[formControlName="emailAddress"]');
    expect(email?.value).toBe('liviu@example.com');
  });

  it('refuses to submit an invalid form', async () => {
    const { vm } = render();
    vm.form.patchValue({ emailAddress: 'nope' });
    await vm.submit();
    expect(api.update).not.toHaveBeenCalled();
  });

  it('does nothing without an active profile', async () => {
    const { vm } = render(false);
    await vm.submit();
    expect(api.update).not.toHaveBeenCalled();
  });

  it('sends a full payload, trimmed, with empty optionals nulled', async () => {
    const { vm } = render();
    vm.form.patchValue({ firstName: '  ', lastName: ' Pop ', age: 40 });

    await vm.submit();

    expect(api.update).toHaveBeenCalledWith(1, {
      emailAddress: 'liviu@example.com',
      firstName: null,
      lastName: 'Pop',
      age: 40,
    });
  });

  it('nulls an absent age rather than sending NaN', async () => {
    const { vm } = render();
    vm.form.patchValue({ age: null });
    await vm.submit();
    expect(api.update).toHaveBeenCalledWith(1, expect.objectContaining({ age: null }));
  });

  it('saves when the form itself is submitted, sending a blank last name as null', async () => {
    const { fixture, vm } = render();
    vm.form.patchValue({ lastName: '   ' });

    (fixture.nativeElement as HTMLElement)
      .querySelector('form')!
      .dispatchEvent(new Event('submit'));

    await vi.waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(1, expect.objectContaining({ lastName: null })),
    );
  });

  it('adopts the SERVER response, not the form values', async () => {
    const { vm } = render();
    vm.form.patchValue({ firstName: 'Typed' });

    await vm.submit();

    expect(session.profile()).toMatchObject({ firstName: 'Server' });
  });

  it('invalidates the users cache, confirms and closes on success', async () => {
    const { vm } = render();
    const invalidate = vi.spyOn(cache, 'invalidate');

    await vm.submit();

    expect(invalidate).toHaveBeenCalledWith(cacheKeys.users);
    expect(toasts.toasts().some((t) => t.message === 'Profile updated.')).toBe(true);
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('is single-flight: a second click while saving is ignored', async () => {
    const { vm } = render();
    let release = (): void => undefined;
    api.update.mockImplementation(() => new Promise((r) => (release = () => r(PROFILE))));

    const first = vm.submit();
    await vi.waitFor(() => expect(vm.saving()).toBe(true));
    await vm.submit();

    release();
    await first;
    expect(api.update).toHaveBeenCalledTimes(1);
  });

  it('explains a 409 in plain language and keeps the dialog open', async () => {
    const { vm } = render();
    api.update.mockRejectedValue(new ApiError('functional', 'duplicate', 409));

    await vm.submit();

    expect(vm.serverError()).toContain('Another profile already uses that email address');
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('surfaces any other verdict verbatim and keeps the dialog open', async () => {
    const { vm } = render();
    api.update.mockRejectedValue(new ApiError('functional', 'Age must be positive', 400));

    await vm.submit();

    expect(vm.serverError()).toBe('Age must be positive');
    expect(ref.close).not.toHaveBeenCalled();
    expect(vm.saving()).toBe(false);
  });
  describe('rendered states', () => {
    type Toggles = {
      saving: { set: (v: boolean) => void };
      serverError: { set: (v: string) => void };
    };

    it('renders the required-email message', async () => {
      const { fixture, vm } = render();
      vm.form.patchValue({ emailAddress: '' });
      await vm.submit();
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'Email address is required',
      );
    });

    it('renders the invalid-email message', async () => {
      const { fixture, vm } = render();
      vm.form.patchValue({ emailAddress: 'nope' });
      await vm.submit();
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        "doesn't look like an email address",
      );
    });

    it('renders the age validation message', async () => {
      const { fixture, vm } = render();
      vm.form.patchValue({ age: -3 });
      await vm.submit();
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'Age must be a positive whole number',
      );
    });

    it('renders a server error inline', async () => {
      const { fixture, vm } = render();
      (vm as unknown as Toggles).serverError.set('Another profile already uses that address.');
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'Another profile already uses that address.',
      );
    });

    it('ghosts the save button while saving — never a spinner', async () => {
      const { fixture, vm } = render();
      (vm as unknown as Toggles).saving.set(true);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.btn-ghost')).not.toBeNull();
      expect(el.textContent).toContain('Saving profile');
      expect(el.querySelector('mat-spinner, .mat-mdc-progress-spinner')).toBeNull();
    });
  });
});
