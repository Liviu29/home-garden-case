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

describe('ThemeStore — toggle and system preference', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
  });

  afterEach(() => vi.unstubAllGlobals());

  it('toggles from light to dark and back', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    const store = TestBed.inject(ThemeStore);

    const before = store.isDark();
    store.toggle();
    expect(store.isDark()).toBe(!before);
    store.toggle();
    expect(store.isDark()).toBe(before);
  });

  it('follows the OS preference when nothing is stored', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(ThemeStore).isDark()).toBe(true);
  });

  it('treats a missing matchMedia as light rather than crashing', () => {
    vi.stubGlobal('matchMedia', undefined);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(ThemeStore).isDark()).toBe(false);
  });

  it('falls back to the system preference when storage throws', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(ThemeStore).isDark()).toBe(true);
    getItem.mockRestore();
  });
});
