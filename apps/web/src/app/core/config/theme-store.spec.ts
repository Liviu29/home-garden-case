import { TestBed } from '@angular/core/testing';
import { ThemeStore } from './theme-store';

describe('ThemeStore (dark mode = one attribute + persisted choice)', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
  });

  it('applies the theme to the document root on creation', () => {
    TestBed.inject(ThemeStore);
    expect(document.documentElement.dataset['theme']).toMatch(/^(light|dark)$/);
  });

  it('toggle flips the theme, the attribute, and persists the choice', () => {
    const store = TestBed.inject(ThemeStore);
    const before = store.theme();

    store.toggle();

    const after = store.theme();
    expect(after).not.toBe(before);
    expect(document.documentElement.dataset['theme']).toBe(after);
    expect(localStorage.getItem('itp-home-garden.theme')).toBe(after);
  });

  it('a stored choice wins over the system preference on startup', () => {
    localStorage.setItem('itp-home-garden.theme', 'dark');
    const store = TestBed.inject(ThemeStore);
    expect(store.isDark()).toBe(true);
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
});
