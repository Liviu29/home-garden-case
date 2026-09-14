/**
 * The stage's pointer machine, without the stage: which pointers are down,
 * whether they pinch, pan or drag a bed, and how far a press has travelled.
 * It turns raw pointer samples into intents; the map component applies them
 * to its camera and its beds, and owns the DOM (capture, focus, tooltips).
 *
 * A press on a bed arms a drag candidate; past the threshold it drags the
 * bed, otherwise the click that follows selects. A press on open ground
 * pans. A second finger is a pinch, never a click. Modes never fight.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** What a pointer event carries that the machine needs. */
export interface PointerSample {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
}

/** Past this many screen px, a press is a drag, not a click. */
export const DRAG_THRESHOLD_PX = 5;

export type MoveIntent =
  /** Two fingers moved: zoom by `factor` around their midpoint (screen px). */
  | { readonly kind: 'pinch'; readonly factor: number; readonly midpoint: Point }
  /** The armed bed moved by this much (screen px) since the last sample. */
  | {
      readonly kind: 'drag';
      readonly plantId: number;
      readonly dxPx: number;
      readonly dyPx: number;
    }
  /** The ground moved: pan the camera the other way. */
  | { readonly kind: 'pan'; readonly dxPx: number; readonly dyPx: number };

export class MapGestures {
  private readonly pointers = new Map<number, Point>();
  private pinchDistance = 0;
  private travelled = 0;
  private last: Point = { x: 0, y: 0 };
  private candidate: number | null = null;

  /** A press on a bed, before the stage's own pointerdown: arms a bed drag. */
  armBed(plantId: number): void {
    this.candidate = plantId;
  }

  /** No pointer is down — hover feedback may follow the cursor. */
  get idle(): boolean {
    return this.pointers.size === 0;
  }

  /** The press that just ended never crossed the drag threshold. */
  get wasTap(): boolean {
    return this.travelled < DRAG_THRESHOLD_PX;
  }

  /** True when this press turned the gesture into a pinch. */
  down(sample: PointerSample): boolean {
    this.pointers.set(sample.pointerId, { x: sample.clientX, y: sample.clientY });
    this.travelled = 0;
    this.last = { x: sample.clientX, y: sample.clientY };
    if (this.pointers.size === 2) {
      this.pinchDistance = this.gap();
      this.candidate = null; // a second finger turns a bed drag into a pinch
      return true;
    }
    return false;
  }

  move(sample: PointerSample): MoveIntent | null {
    if (!this.pointers.has(sample.pointerId)) {
      return null;
    }
    const point = { x: sample.clientX, y: sample.clientY };
    this.pointers.set(sample.pointerId, point);

    if (this.pointers.size === 2) {
      const gap = this.gap();
      const intent: MoveIntent | null =
        this.pinchDistance > 0 && gap > 0
          ? { kind: 'pinch', factor: gap / this.pinchDistance, midpoint: this.midpoint() }
          : null;
      this.pinchDistance = gap;
      return intent;
    }

    const dxPx = point.x - this.last.x;
    const dyPx = point.y - this.last.y;
    this.travelled += Math.abs(dxPx) + Math.abs(dyPx);
    this.last = point;
    if (this.travelled < DRAG_THRESHOLD_PX) {
      return null;
    }
    return this.candidate === null
      ? { kind: 'pan', dxPx, dyPx }
      : { kind: 'drag', plantId: this.candidate, dxPx, dyPx };
  }

  up(sample: PointerSample): void {
    this.pointers.delete(sample.pointerId);
    this.pinchDistance = 0;
    this.candidate = null;
    // Pinch → one finger lifted: re-anchor to the remaining pointer, or the
    // next move would compute a delta from the lifted finger's stale position
    // and the camera would jump.
    if (this.pointers.size === 1) {
      const [remaining] = this.pointers.values();
      this.last = remaining;
    }
  }

  private gap(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private midpoint(): Point {
    const [a, b] = [...this.pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
}
