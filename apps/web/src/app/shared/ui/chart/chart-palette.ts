/**
 * Chart colours come from the design tokens, read when a chart is built.
 * Highcharts draws SVG presentation attributes, where `var(--token)` does not
 * resolve, so a chart is given concrete colours and rebuilt when the theme
 * changes (ADR-008).
 */
export interface ChartPalette {
  readonly text: string;
  readonly muted: string;
  readonly faint: string;
  readonly grid: string;
  readonly surface: string;
  readonly brand: string;
  readonly warn: string;
  readonly danger: string;
  readonly info: string;
  readonly dry: string;
  readonly balanced: string;
  readonly humid: string;
}

const TOKEN: Readonly<Record<keyof ChartPalette, string>> = {
  text: '--text-1',
  muted: '--text-2',
  faint: '--text-3',
  grid: '--border',
  surface: '--surface-1',
  brand: '--brand-500',
  warn: '--accent-amber',
  danger: '--danger',
  info: '--info-blue',
  dry: '--zone-dry',
  balanced: '--zone-balanced',
  humid: '--zone-humid',
};

/** The light theme's values, used when a token is unavailable (unit tests). */
const FALLBACK: ChartPalette = {
  text: '#1c1917',
  muted: '#57534e',
  faint: '#6f6a65',
  grid: '#e7e5e4',
  surface: '#ffffff',
  brand: '#16a34a',
  warn: '#a16207',
  danger: '#b91c1c',
  info: '#075985',
  dry: '#d6a041',
  balanced: '#5aa86c',
  humid: '#3d8ed9',
};

export function readChartPalette(root: Element = document.documentElement): ChartPalette {
  const css = getComputedStyle(root);
  const read = (key: keyof ChartPalette) =>
    [key, css.getPropertyValue(TOKEN[key]).trim() || FALLBACK[key]] as const;
  return Object.fromEntries(
    (Object.keys(TOKEN) as (keyof ChartPalette)[]).map(read),
  ) as unknown as ChartPalette;
}

/** `#rgb`, `#rrggbb` or `rgb(…)` with an alpha channel; any other colour is returned as is. */
export function withAlpha(color: string, alpha: number): string {
  const value = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const digits = hex[1] ?? '';
    const full = digits.length === 3 ? [...digits].map((c) => c + c).join('') : digits;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (rgb) {
    const [r, g, b] = rgb[1].split(/[\s,/]+/).filter(Boolean);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return value;
}

/** Garden and plant names are user input: escape them before Highcharts' HTML-subset labels. */
export function escapeLabel(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
