import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { UserProfile } from '../api/models';
import { UsersApi } from '../api/users-api';
import { SessionStore } from './session-store';

const STORAGE_KEY = 'itp-home-garden.session';

const profile = (over: Partial<UserProfile> = {}): UserProfile => ({
  userId: 1,
  emailAddress: 'liviu@example.com',
  firstName: 'Liviu',
  lastName: 'Nita',
  age: 33,
  ...over,
});

const httpError = (status: number) =>
  new HttpErrorResponse({ status, error: { message: 'x' }, statusText: 'x' });

const makeStore = (api: Partial<UsersApi> = {}): SessionStore => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: UsersApi, useValue: api }] });
  return TestBed.inject(SessionStore);
};

describe('SessionStore (ADR-005 profile session)', () => {
  beforeEach(() => localStorage.clear());

  describe('sign in / sign out', () => {
    it('starts inactive with no persisted session', () => {
      const store = makeStore();
      expect(store.isActive()).toBe(false);
      expect(store.profile()).toBeNull();
    });

    it('signing in exposes the profile and persists it', () => {
      const store = makeStore();
      store.signIn(profile());

      expect(store.isActive()).toBe(true);
      expect(store.profile()).toMatchObject({ userId: 1 });
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toMatchObject({ userId: 1 });
    });

    it('signing out clears both the signal and storage', () => {
      const store = makeStore();
      store.signIn(profile());
      store.signOut();

      expect(store.isActive()).toBe(false);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('rehydrates a persisted session on construction', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile({ userId: 77 })));
      expect(makeStore().profile()).toMatchObject({ userId: 77 });
    });

    it('treats corrupt persisted JSON as no session rather than throwing', () => {
      localStorage.setItem(STORAGE_KEY, '{not json');
      expect(makeStore().isActive()).toBe(false);
    });
  });

  describe('display derivations', () => {
    it('are empty strings with no session', () => {
      const store = makeStore();
      expect(store.displayName()).toBe('');
      expect(store.initials()).toBe('');
    });

    it('join first and last name', () => {
      const store = makeStore();
      store.signIn(profile());
      expect(store.displayName()).toBe('Liviu Nita');
      expect(store.initials()).toBe('LN');
    });

    it('fall back to the email address when no name is set', () => {
      const store = makeStore();
      store.signIn(profile({ firstName: null, lastName: null }));
      expect(store.displayName()).toBe('liviu@example.com');
      expect(store.initials()).toBe('L');
    });

    it('use whichever single name part exists', () => {
      const store = makeStore();
      store.signIn(profile({ lastName: null }));
      expect(store.displayName()).toBe('Liviu');
      expect(store.initials()).toBe('L');
    });
  });

  describe('revalidate — deliberately asymmetric against a 10%-failure backend', () => {
    it('returns false without calling the API when there is no session', async () => {
      const getById = vi.fn();
      const store = makeStore({ getById } as unknown as UsersApi);
      await expect(store.revalidate()).resolves.toBe(false);
      expect(getById).not.toHaveBeenCalled();
    });

    it('adopts the server-authoritative profile on success', async () => {
      const fresh = profile({ firstName: 'Renamed', age: 34 });
      const store = makeStore({ getById: vi.fn().mockResolvedValue(fresh) } as unknown as UsersApi);
      store.signIn(profile());

      await expect(store.revalidate()).resolves.toBe(true);
      expect(store.profile()).toMatchObject({ firstName: 'Renamed', age: 34 });
    });

    it('signs out on a 404 — the profile really is gone', async () => {
      const store = makeStore({
        getById: vi.fn().mockRejectedValue(httpError(404)),
      } as unknown as UsersApi);
      store.signIn(profile());

      await expect(store.revalidate()).resolves.toBe(false);
      expect(store.isActive()).toBe(false);
    });

    it('KEEPS the session on a 500 — otherwise 10% of visits would sign the user out', async () => {
      const store = makeStore({
        getById: vi.fn().mockRejectedValue(httpError(500)),
      } as unknown as UsersApi);
      store.signIn(profile());

      await expect(store.revalidate()).resolves.toBe(true);
      expect(store.isActive()).toBe(true);
    });

    it('keeps the session on a network failure too', async () => {
      const store = makeStore({
        getById: vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 0 })),
      } as unknown as UsersApi);
      store.signIn(profile());

      await expect(store.revalidate()).resolves.toBe(true);
      expect(store.isActive()).toBe(true);
    });
  });

  it('survives storage being unavailable (private mode) without throwing', () => {
    const store = makeStore();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    expect(() => store.signIn(profile())).not.toThrow();
    expect(store.isActive()).toBe(true); // in-memory session still works
    setItem.mockRestore();
  });
});
