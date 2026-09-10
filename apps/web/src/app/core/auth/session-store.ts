import { Injectable, computed, inject, signal } from '@angular/core';
import { UserProfile } from '../api/models';
import { UsersApi } from '../api/users-api';
import { toApiError } from '../errors/api-error';

const STORAGE_KEY = 'itp-home-garden.session';

/**
 * Active profile session (ADR-005 — the shipped mock-auth flow).
 * Persisted to localStorage; the seam where a real `/auth/me` bootstrap
 * would plug in.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly usersApi = inject(UsersApi);
  private readonly _profile = signal<UserProfile | null>(readPersisted());

  readonly profile = computed(() => this._profile());
  readonly isActive = computed(() => this._profile() !== null);
  readonly displayName = computed(() => {
    const p = this._profile();
    if (!p) {
      return '';
    }
    const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
    return name || p.emailAddress;
  });
  readonly initials = computed(() => {
    const p = this._profile();
    if (!p) {
      return '';
    }
    const first = p.firstName?.[0] ?? p.emailAddress[0];
    const last = p.lastName?.[0] ?? '';
    return (first + last).toUpperCase();
  });

  signIn(profile: UserProfile): void {
    this._profile.set(profile);
    persist(profile);
  }

  signOut(): void {
    this._profile.set(null);
    persist(null);
  }

  /**
   * Confirm the persisted profile still exists — `GET /users/{userId}`.
   *
   * The session lives in localStorage, so it outlives the profile it points at
   * (deleted elsewhere, or `db.sqlite` reset between runs). Without this the
   * app would happily greet a profile the backend no longer has.
   *
   * Deliberately asymmetric, because this backend fails 10% of requests at
   * random: only a **404** ends the session; 5xx/network leave it untouched.
   *
   * @returns true when the session is still valid (or could not be checked).
   */
  async revalidate(): Promise<boolean> {
    const current = this._profile();
    if (!current) {
      return false;
    }
    try {
      const fresh = await this.usersApi.getById(current.userId);
      this.signIn(fresh); // adopt server-authoritative name/email/age
      return true;
    } catch (err) {
      if (toApiError(err).kind === 'not-found') {
        this.signOut();
        return false;
      }
      return true; // transient — keep the session, never sign out on a 500
    }
  }
}

function readPersisted(): UserProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

function persist(profile: UserProfile | null): void {
  try {
    if (profile) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage unavailable (private mode) — session simply won't survive reloads.
  }
}
