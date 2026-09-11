import { TestBed } from '@angular/core/testing';
import {
  SvgExporter,
  backgroundBehind,
  embedReferencedDefs,
  inlineComputedStyles,
  pngFileName,
  referencedIds,
  standaloneSvg,
} from './svg-export';

/**
 * jsdom cannot cascade SVG styles, lay anything out or rasterise, so the
 * browser's side of each step is stubbed: computed styles, element size,
 * image decoding, the canvas and object URLs. What is under test is what
 * this file decides — which styles travel, the size, the scale, the name.
 */

/** Computed styles by element: `.bed` is green, everything else unstyled. */
function stubComputedStyles(backgrounds: ReadonlyMap<Element, string> = new Map()) {
  return vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (el: Element) =>
      ({
        getPropertyValue: (property: string) =>
          el.classList.contains('bed') && property === 'fill' ? 'rgb(90, 168, 108)' : '',
        backgroundColor: backgrounds.get(el) ?? 'rgba(0, 0, 0, 0)',
      }) as unknown as CSSStyleDeclaration,
  );
}

function drawing(): SVGSVGElement {
  const host = document.createElement('div');
  host.innerHTML =
    '<svg viewBox="0 0 10 10"><rect class="bed" width="4" height="4"></rect><text>Basil</text></svg>';
  document.body.appendChild(host);
  const svg = host.querySelector('svg') as SVGSVGElement;
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ width: 300, height: 150 } as DOMRect);
  return svg;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('embedReferencedDefs (the plant artwork lives outside the drawing)', () => {
  const NS = 'http://www.w3.org/2000/svg';

  /** A page with one shared `<svg>` of symbols, then the drawing (returned). */
  const page = (drawingMarkup: string): SVGSVGElement => {
    document.body.innerHTML =
      '<svg width="0" height="0"><defs>' +
      '<symbol id="art"><use href="#leaf" fill="url(#tip)"></use></symbol>' +
      '<path id="leaf" d="M0 0"></path>' +
      '<linearGradient id="tip"></linearGradient>' +
      '<symbol id="unused"></symbol>' +
      '</defs></svg>' +
      drawingMarkup;
    return document.body.lastElementChild as SVGSVGElement;
  };

  it('finds what an element points at: href, xlink:href and url() paints', () => {
    const use = document.createElementNS(NS, 'use');
    use.setAttribute('href', '#art');
    use.setAttribute('style', 'fill: url("#tip"); stroke: url(#rim)');
    expect(referencedIds(use)).toEqual(['art', 'tip', 'rim']);

    const legacy = document.createElementNS(NS, 'use');
    legacy.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#leaf');
    expect(referencedIds(legacy)).toEqual(['leaf']);

    expect(referencedIds(document.createElementNS(NS, 'rect'))).toEqual([]);
  });

  it('copies what the drawing points at, and what that points at, each once', () => {
    const svg = page(
      '<svg><pattern id="grid"></pattern><rect fill="url(#grid)"></rect>' +
        '<use href="#art"></use><use href="#art"></use><use href="#nowhere"></use></svg>',
    );
    const copy = svg.cloneNode(true) as SVGSVGElement;

    embedReferencedDefs(copy, document);

    const defs = copy.firstElementChild as Element;
    expect(defs.tagName.toLowerCase()).toBe('defs');
    expect(Array.from(defs.children, (el) => el.id).sort()).toEqual(['art', 'leaf', 'tip']);
    expect(copy.querySelectorAll('#grid')).toHaveLength(1); // its own, not copied again
  });

  it('adds nothing to a drawing that points only at itself', () => {
    const svg = page('<svg><pattern id="grid"></pattern><rect fill="url(#grid)"></rect></svg>');
    const copy = svg.cloneNode(true) as SVGSVGElement;

    embedReferencedDefs(copy, document);

    expect(copy.querySelector('defs')).toBeNull();
  });
});

describe('pngFileName', () => {
  it('turns a title into a safe, lower-case file name', () => {
    expect(pngFileName('Back Garden — plan')).toBe('back-garden-plan.png');
    expect(pngFileName('Café Été 2026')).toBe('cafe-ete-2026.png');
    expect(pngFileName('!!!')).toBe('export.png');
  });
});

describe('backgroundBehind', () => {
  it('is the nearest colour behind the element that is not transparent', () => {
    const outer = document.createElement('div');
    const inner = document.createElement('div');
    outer.appendChild(inner);
    stubComputedStyles(new Map([[outer, 'rgb(1, 2, 3)']]));
    expect(backgroundBehind(inner)).toBe('rgb(1, 2, 3)');
  });

  it('falls back to white when everything is transparent', () => {
    stubComputedStyles();
    expect(backgroundBehind(document.createElement('div'))).toBe('#ffffff');
  });
});

describe('inlineComputedStyles and standaloneSvg', () => {
  it('writes each element’s computed styles onto the copy, not the original', () => {
    stubComputedStyles();
    const svg = drawing();
    const copy = svg.cloneNode(true) as SVGSVGElement;

    inlineComputedStyles(svg, copy);

    expect((copy.querySelector('.bed') as SVGElement).style.getPropertyValue('fill')).toBe(
      'rgb(90, 168, 108)',
    );
    expect((copy.querySelector('text') as SVGElement).getAttribute('style')).toBeNull();
    expect((svg.querySelector('.bed') as SVGElement).getAttribute('style')).toBeNull();
  });

  it('is a standalone document at the on-screen size, on the given background', () => {
    stubComputedStyles();
    const markup = standaloneSvg(drawing(), 'rgb(250, 250, 248)');

    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(markup).toContain('width="300"');
    expect(markup).toContain('height="150"');
    expect(markup).toContain('background: rgb(250, 250, 248)');
    expect(markup).toContain('fill: rgb(90, 168, 108)');
  });
});

describe('SvgExporter', () => {
  let exporter: SvgExporter;
  let context: { scale: ReturnType<typeof vi.fn>; drawImage: ReturnType<typeof vi.fn> };

  /** An image that decodes at once — or fails, when told to. */
  const stubImage = (fails = false) =>
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => (fails ? this.onerror?.() : this.onload?.()));
        }
      },
    );

  beforeEach(() => {
    stubComputedStyles();
    stubImage();
    context = { scale: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback) {
      callback(new Blob(['png'], { type: 'image/png' }));
    });
    exporter = TestBed.inject(SvgExporter);
  });

  it('draws the SVG at twice its on-screen size', async () => {
    const blob = await exporter.toPng(drawing());

    expect(blob.type).toBe('image/png');
    expect(context.scale).toHaveBeenCalledWith(2, 2);
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 300, 150);
  });

  it('downloads it under a name from the title, then lets the URL go', async () => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:png'), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('back-garden-plan.png');
      expect(this.href).toBe('blob:png');
    });

    await exporter.downloadPng(drawing(), 'Back Garden plan');

    expect(click).toHaveBeenCalledOnce();
    await new Promise((resolve) => setTimeout(resolve));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:png');
  });

  it('fails clearly when the browser cannot draw', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    await expect(exporter.toPng(drawing())).rejects.toThrow('This browser cannot draw the image.');
  });

  it('fails clearly when no image comes out', async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(function (callback) {
      callback(null);
    });
    await expect(exporter.toPng(drawing())).rejects.toThrow('The image could not be created.');
  });

  it('fails clearly when the SVG cannot be decoded', async () => {
    stubImage(true);
    await expect(exporter.toPng(drawing())).rejects.toThrow('The image could not be drawn.');
  });
});
