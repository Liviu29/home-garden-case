import {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
  cameraKey,
  clampCamera,
  fitCamera,
  focusOn,
  isFitted,
  panBy,
  pxPerUnit,
  screenToMap,
  viewBoxOf,
  zoomBy,
} from './map-camera';

const content = { width: 16, height: 10 };

describe('MapCamera (pure pan/zoom math)', () => {
  it('fit shows the whole garden centered at zoom 1', () => {
    const cam = fitCamera(content);
    expect(cam).toEqual({ cx: 8, cy: 5, zoom: 1 });
    expect(viewBoxOf(cam, content)).toBe('0 0 16 10');
  });

  it('zoom clamps to [MIN_ZOOM, MAX_ZOOM]', () => {
    let cam = fitCamera(content);
    cam = zoomBy(cam, content, 0.01);
    expect(cam.zoom).toBe(MIN_ZOOM);
    for (let i = 0; i < 20; i++) {
      cam = zoomBy(cam, content, 2);
    }
    expect(cam.zoom).toBe(MAX_ZOOM);
  });

  it('zoomed out beyond fit, the view locks to the garden center (no inverted clamp)', () => {
    // At < 1× the visible span exceeds the garden — panning must not strand
    // the camera or oscillate; the center pins to the middle of the world.
    let cam = zoomBy(fitCamera(content), content, 0.5);
    expect(cam.zoom).toBeCloseTo(0.5, 5);
    cam = panBy(cam, content, 1000, -1000);
    expect(cam.cx).toBe(content.width / 2);
    expect(cam.cy).toBe(content.height / 2);
  });

  it('zooming toward an anchor keeps that map point fixed on screen', () => {
    const cam = fitCamera(content);
    const anchor = { x: 12, y: 8 };
    const zoomed = zoomBy(cam, content, 2, anchor);
    // The anchor's relative position inside the view must be unchanged:
    // before: (12-0)/16 = 0.75 of the width. After: same fraction.
    const w = content.width / zoomed.zoom;
    const h = content.height / zoomed.zoom;
    const left = zoomed.cx - w / 2;
    const top = zoomed.cy - h / 2;
    expect((anchor.x - left) / w).toBeCloseTo(0.75, 5);
    expect((anchor.y - top) / h).toBeCloseTo(0.8, 5);
  });

  it('panning is clamped so the view never leaves the garden', () => {
    let cam = zoomBy(fitCamera(content), content, 2);
    cam = panBy(cam, content, 1000, 1000);
    // at zoom 2 the half-view is 4×2.5 — center can reach at most (12, 7.5)
    expect(cam.cx).toBe(12);
    expect(cam.cy).toBe(7.5);
    cam = panBy(cam, content, -1000, -1000);
    expect(cam.cx).toBe(4);
    expect(cam.cy).toBe(2.5);
  });

  it('panning at fit zoom or wider is a no-op (nothing to pan to)', () => {
    const cam = panBy(fitCamera(content), content, 5, 5);
    expect(cam).toEqual(fitCamera(content));
  });

  it('focusOn centers a point and raises zoom to at least the focus zoom', () => {
    const cam = focusOn(fitCamera(content), content, { x: 6, y: 4 });
    expect(cam.zoom).toBeGreaterThanOrEqual(1.6);
    expect(cam.cx).toBeCloseTo(6, 5);
    expect(cam.cy).toBeCloseTo(4, 5);
  });

  it('focusOn clamps a corner focus so the view stays inside the garden', () => {
    const cam = focusOn(fitCamera(content), content, { x: 0, y: 0 });
    // at zoom 1.6 the half-view is 5 × 3.125 — the closest legal center
    expect(cam.cx).toBeCloseTo(5, 5);
    expect(cam.cy).toBeCloseTo(3.125, 5);
  });

  it('clamps against a content box that does not start at the origin', () => {
    // The map component hands the camera a box grown to the STAGE's aspect
    // ratio and centred on the garden, so its origin is negative. Clamping
    // relative to 0 would have let the view drift off that box.
    const box = { width: 8, height: 4, x: -1, y: -0.5 };

    expect(fitCamera(box)).toEqual({ cx: 3, cy: 1.5, zoom: 1 });

    const zoomed = zoomBy(fitCamera(box), box, 2);
    const far = panBy(zoomed, box, 999, 999);
    // Half-spans at 2x are 2 and 1, so the centre stops that far from the
    // box's real far edge (-1 + 8 = 7, -0.5 + 4 = 3.5).
    expect(far.cx).toBeCloseTo(5, 6);
    expect(far.cy).toBeCloseTo(2.5, 6);

    const near = panBy(zoomed, box, -999, -999);
    expect(near.cx).toBeCloseTo(1, 6);
    expect(near.cy).toBeCloseTo(0.5, 6);
  });

  it('isFitted recognises only the exact Fit view (what a resize may re-frame)', () => {
    expect(isFitted(fitCamera(content), content)).toBe(true);
    expect(isFitted(zoomBy(fitCamera(content), content, 1.4), content)).toBe(false);
    expect(isFitted({ ...fitCamera(content), cx: 9 }, content)).toBe(false);
    expect(isFitted({ ...fitCamera(content), cy: 6 }, content)).toBe(false);
  });

  it('clampCamera pulls a stale view back inside a frame that shrank under it', () => {
    // A view kept across a resize must still obey the new frame's bounds.
    expect(clampCamera({ cx: 100, cy: 100, zoom: 2 }, content)).toEqual({
      cx: 12,
      cy: 7.5,
      zoom: 2,
    });
  });
});

describe('MapCamera — the stage keyboard', () => {
  const zoomed = zoomBy(fitCamera(content), content, 2);

  it('arrows pan a twelfth of the view, + and - zoom a step, 0 and f fit', () => {
    expect(cameraKey('ArrowRight', zoomed, content)?.cx).toBeCloseTo(8 + 16 / 2 / 12);
    expect(cameraKey('ArrowDown', zoomed, content)?.cy).toBeCloseTo(5 + 16 / 2 / 12);
    expect(cameraKey('+', zoomed, content)?.zoom).toBeCloseTo(2 * ZOOM_STEP);
    expect(cameraKey('=', zoomed, content)?.zoom).toBeCloseTo(2 * ZOOM_STEP);
    expect(cameraKey('-', zoomed, content)?.zoom).toBeCloseTo(2 / ZOOM_STEP);
    expect(cameraKey('0', zoomed, content)).toEqual(fitCamera(content));
    expect(cameraKey('f', zoomed, content)).toEqual(fitCamera(content));
  });

  it('leaves every other key to the page', () => {
    expect(cameraKey('Tab', zoomed, content)).toBeNull();
    expect(cameraKey('Escape', zoomed, content)).toBeNull();
  });
});

describe('MapCamera — screen ↔ map units', () => {
  const fit = fitCamera(content);

  it('the scale is the tighter axis: a taller stage letterboxes above and below', () => {
    expect(pxPerUnit({ width: 800, height: 500 }, content, fit)).toBe(50);
    expect(pxPerUnit({ width: 800, height: 1000 }, content, fit)).toBe(50);
    expect(pxPerUnit({ width: 800, height: 500 }, content, { ...fit, zoom: 2 })).toBe(100);
    expect(pxPerUnit({ width: 0, height: 0 }, content, fit)).toBe(0);
  });

  it('maps a screen point through the letterbox offset', () => {
    const rect = { left: 10, top: 20, width: 800, height: 500 };
    expect(screenToMap(rect, content, fit, 410, 270)).toEqual({ x: 8, y: 5 });
    expect(screenToMap(rect, content, fit, 10, 20)).toEqual({ x: 0, y: 0 });
    // Taller stage: 250px of letterbox above the garden.
    const tall = { left: 0, top: 0, width: 800, height: 1000 };
    expect(screenToMap(tall, content, fit, 0, 250)).toEqual({ x: 0, y: 0 });
  });

  it('with no stage size yet, a screen point is the view\u2019s centre', () => {
    const none = { left: 0, top: 0, width: 0, height: 0 };
    expect(screenToMap(none, content, fit, 123, 456)).toEqual({ x: 8, y: 5 });
  });
});
