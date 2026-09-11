import { DOCUMENT, Injectable, inject } from '@angular/core';

/**
 * The computed styles an SVG needs to look the same outside the page. A
 * serialized SVG is drawn as an image, where the app's stylesheets and CSS
 * variables do not apply, so these are written onto each element inline.
 */
const PRESENTATION_PROPERTIES = [
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'color',
  'display',
  'visibility',
  'font-family',
  'font-size',
  'font-weight',
  'text-anchor',
  'dominant-baseline',
  'paint-order',
  'vector-effect',
] as const;

/** PNGs are drawn at twice the on-screen size, so they stay sharp when zoomed. */
const EXPORT_SCALE = 2;

/**
 * Copies each element's computed presentation styles from `original` onto
 * the matching element of `copy` (a deep clone of it).
 */
export function inlineComputedStyles(original: SVGElement, copy: SVGElement): void {
  const sources = [original, ...Array.from(original.querySelectorAll<SVGElement>('*'))];
  const targets = [copy, ...Array.from(copy.querySelectorAll<SVGElement>('*'))];
  sources.forEach((source, i) => {
    const computed = getComputedStyle(source);
    const target = targets[i];
    for (const property of PRESENTATION_PROPERTIES) {
      const value = computed.getPropertyValue(property);
      if (value) {
        target.style.setProperty(property, value);
      }
    }
  });
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** `url(#id)` in a paint, clip, mask or style value. */
const URL_REFERENCE = /url\(\s*["']?#([^"')\s]+)["']?\s*\)/g;

/** The ids an element points at: `href="#id"` and every `url(#id)`. */
export function referencedIds(el: Element): string[] {
  const ids: string[] = [];
  const href = el.getAttribute('href') ?? el.getAttribute('xlink:href');
  if (href?.startsWith('#')) {
    ids.push(href.slice(1));
  }
  for (const { value } of Array.from(el.attributes)) {
    for (const match of value.matchAll(URL_REFERENCE)) {
      ids.push(match[1]);
    }
  }
  return ids;
}

/**
 * Copies into `copy` the page elements it points at but does not hold, and
 * whatever those point at in turn. The plant artwork is the case in point:
 * it lives in one `<svg>` of symbols per page (PlantArtworkDefs), outside
 * the drawing. The copies travel as they are — their paint comes from
 * attributes and from the `--pv-*` custom properties already inline on
 * the drawing.
 */
export function embedReferencedDefs(copy: SVGSVGElement, doc: Document): void {
  const defs = doc.createElementNS(SVG_NS, 'defs');
  const held = new Set(Array.from(copy.querySelectorAll('[id]'), (el) => el.id));
  const toScan: Element[] = [copy];
  for (let root = toScan.pop(); root; root = toScan.pop()) {
    for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
      for (const id of referencedIds(el)) {
        const source = held.has(id) ? null : doc.getElementById(id);
        if (source) {
          const clone = source.cloneNode(true) as Element;
          held.add(id);
          clone.querySelectorAll('[id]').forEach((inner) => held.add(inner.id));
          defs.appendChild(clone);
          toScan.push(clone);
        }
      }
    }
  }
  if (defs.childElementCount > 0) {
    copy.insertBefore(defs, copy.firstChild);
  }
}

/**
 * The SVG as a standalone document: styles inlined, what it points at
 * embedded, the on-screen size set, and a background painted behind it (the
 * page's own colour, not transparency).
 */
export function standaloneSvg(svg: SVGSVGElement, background: string): string {
  const { width, height } = svg.getBoundingClientRect();
  const copy = svg.cloneNode(true) as SVGSVGElement;
  inlineComputedStyles(svg, copy);
  // After inlining: an inlined paint can itself be a url(#…)
  embedReferencedDefs(copy, svg.ownerDocument);
  copy.setAttribute('xmlns', SVG_NS);
  copy.setAttribute('width', String(Math.round(width)));
  copy.setAttribute('height', String(Math.round(height)));
  copy.style.setProperty('background', background);
  return new XMLSerializer().serializeToString(copy);
}

/** The first colour behind `el` that is not transparent — what the user sees it on. */
export function backgroundBehind(el: Element): string {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color && color !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(color)) {
      return color;
    }
  }
  return '#ffffff';
}

/** A file name from a title: "Back Garden — plan" → "back-garden-plan.png". */
export function pngFileName(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // the accents NFKD split off: "é" → "e"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'export'}.png`;
}

/**
 * Turns an on-screen SVG — a Highcharts chart or the garden planner — into a
 * PNG the browser downloads. Everything happens in the page: no export
 * server, and nothing leaves the device.
 */
@Injectable({ providedIn: 'root' })
export class SvgExporter {
  private readonly document = inject(DOCUMENT);

  async downloadPng(svg: SVGSVGElement, title: string): Promise<void> {
    const blob = await this.toPng(svg);
    this.download(blob, pngFileName(title));
  }

  async toPng(svg: SVGSVGElement): Promise<Blob> {
    const { width, height } = svg.getBoundingClientRect();
    const markup = standaloneSvg(svg, backgroundBehind(svg));
    const image = await this.loadImage(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`,
    );

    const canvas = this.document.createElement('canvas');
    canvas.width = Math.round(width * EXPORT_SCALE);
    canvas.height = Math.round(height * EXPORT_SCALE);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('This browser cannot draw the image.');
    }
    context.scale(EXPORT_SCALE, EXPORT_SCALE);
    context.drawImage(image, 0, 0, width, height);

    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be created.'))),
        'image/png',
      ),
    );
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The image could not be drawn.'));
      image.src = src;
    });
  }

  private download(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    // The click has handed the file to the browser; the URL is no longer needed.
    setTimeout(() => URL.revokeObjectURL(url));
  }
}
