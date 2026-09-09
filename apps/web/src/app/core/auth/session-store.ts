import { Injectable, computed, signal } from '@angular/core';
import { UserProfile } from '../api/models';

const STORAGE_KEY = 'itp-home-garden.session';

/**
 * Active profile session (ADR-005 — the shipped mock-auth flow).
 * Persisted to localStorage; the seam where a real `/auth/me` bootstrap
 * would plug in.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
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
