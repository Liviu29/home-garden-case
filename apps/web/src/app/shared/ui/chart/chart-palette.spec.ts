import { escapeLabel, readChartPalette, withAlpha } from './chart-palette';

describe('chart palette', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads each colour from its design token', () => {
    const tokens: Record<string, string> = { '--text-1': ' #010203 ', '--zone-humid': '#0000ff' };
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (name: string) => tokens[name] ?? '',
    } as unknown as CSSStyleDeclaration);

    const palette = readChartPalette(document.createElement('div'));

    expect(palette.text).toBe('#010203');
    expect(palette.humid).toBe('#0000ff');
  });

  it('falls back to the light theme when a token is missing', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: () => '',
    } as unknown as CSSStyleDeclaration);

    expect(readChartPalette()).toMatchObject({ brand: '#16a34a', dry: '#d6a041' });
  });

  it('adds transparency to hex and rgb colours and leaves anything else alone', () => {
    expect(withAlpha('#16a34a', 0.1)).toBe('rgba(22, 163, 74, 0.1)');
    expect(withAlpha('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(withAlpha('rgb(1, 2, 3)', 0.2)).toBe('rgba(1, 2, 3, 0.2)');
    expect(withAlpha('red', 0.2)).toBe('red');
  });

  it('escapes a name before it reaches a chart label', () => {
    expect(escapeLabel('<Tom & "Jerry">')).toBe('&lt;Tom &amp; &quot;Jerry&quot;&gt;');
  });
});
