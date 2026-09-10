/**
 * Pure pan/zoom camera for the Garden Map (ADR-007) — the ~100 lines that
 * replace pixi-viewport at this scale. State is an immutable value; every
 * operation returns a new state, clamped so the garden can never be lost
 * off-screen. The component maps state → SVG viewBox.
 *
 * zoom 1 == the whole garden fits the viewport ("Fit"); zoom N == N× closer.
 */

export interface CameraState {
  /** Center of the view, in map units. */
  readonly cx: number;
  readonly cy: number;
  readonly zoom: number;
}

// 0.5× lets the gardener step back and see the whole plot with breathing
// room; 10× gets close enough to read a single bed's area label comfortably.
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 10;
export const ZOOM_STEP = 1.4;

interface ContentSize {
  readonly width: number;
  readonly height: number;
}

export function fitCamera(content: ContentSize): CameraState {
  return { cx: content.width / 2, cy: content.height / 2, zoom: 1 };
}

/** The visible rect in map units for a given state. */
export function viewBoxOf(state: CameraState, content: ContentSize): string {
  const w = content.width / state.zoom;
  const h = content.height / state.zoom;
  return `${state.cx - w / 2} ${state.cy - h / 2} ${w} ${h}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Keeps the view center inside the content so panning can't strand the user.
 * Zoomed out beyond fit (< 1×) the visible span exceeds the garden — the
 * axis locks to the garden's center instead of oscillating between an
 * inverted min/max pair.
 */
function clampState(state: CameraState, content: ContentSize): CameraState {
  const zoom = clamp(state.zoom, MIN_ZOOM, MAX_ZOOM);
  const halfW = content.width / zoom / 2;
  const halfH = content.height / zoom / 2;
  const axis = (value: number, half: number, size: number): number =>
    half >= size / 2 ? size / 2 : clamp(value, half, size - half);
  return {
    zoom,
    cx: axis(state.cx, halfW, content.width),
    cy: axis(state.cy, halfH, content.height),
  };
}

/** Pan by a delta expressed in map units. */
export function panBy(
  state: CameraState,
  content: ContentSize,
  dx: number,
  dy: number,
): CameraState {
  return clampState({ ...state, cx: state.cx + dx, cy: state.cy + dy }, content);
}

/**
 * Zoom by `factor`, keeping `anchor` (map units) fixed on screen — the
 * "zoom toward the cursor" behavior. Without an anchor, zooms on center.
 */
export function zoomBy(
  state: CameraState,
  content: ContentSize,
  factor: number,
  anchor?: { readonly x: number; readonly y: number },
): CameraState {
  const zoom = clamp(state.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  if (zoom === state.zoom) {
    return state;
  }
  if (!anchor) {
    return clampState({ ...state, zoom }, content);
  }
  // Keep the anchor's screen position constant: the center moves toward the
  // anchor proportionally to how much the visible span shrank.
  const ratio = state.zoom / zoom;
  return clampState(
    {
      zoom,
      cx: anchor.x - (anchor.x - state.cx) * ratio,
      cy: anchor.y - (anchor.y - state.cy) * ratio,
    },
    content,
  );
}

/** Center the view on a point at (at least) the given zoom. */
export function focusOn(
  state: CameraState,
  content: ContentSize,
  point: { readonly x: number; readonly y: number },
  minZoom = 1.6,
): CameraState {
  return clampState({ cx: point.x, cy: point.y, zoom: Math.max(state.zoom, minZoom) }, content);
}
