import { MAX_ZOOM, MIN_ZOOM, fitCamera, focusOn, panBy, viewBoxOf, zoomBy } from './map-camera';

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
});
