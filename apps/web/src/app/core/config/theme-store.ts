import { Injectable, computed, signal } from '@angular/core';

type ThemeName = 'light' | 'dark';

const STORAGE_KEY = 'itp-home-garden.theme';

/**
 * Theme state (DESIGN-SYSTEM §7): dark mode is a token remap driven by one
 * `data-theme` attribute + `color-scheme` (Material follows it). First visit
 * honors `prefers-color-scheme`; an explicit choice persists per user.
 */
@Injectable({ providedIn: 'root' })
export class ThemeStore {
  private readonly _theme = signal<ThemeName>(initialTheme());

  readonly theme = computed(() => this._theme());
  readonly isDark = computed(() => this._theme() === 'dark');

  constructor() {
    apply(this._theme());
  }

  toggle(): void {
    this.set(this._theme() === 'dark' ? 'light' : 'dark');
  }

  set(theme: ThemeName): void {
    this._theme.set(theme);
    apply(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage unavailable — the choice simply won't survive reloads.
    }
  }
}

function initialTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // fall through to system preference
  }
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function apply(theme: ThemeName): void {
  document.documentElement.dataset['theme'] = theme;
}
