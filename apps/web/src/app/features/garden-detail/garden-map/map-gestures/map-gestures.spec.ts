import { DRAG_THRESHOLD_PX, MapGestures } from './map-gestures';

const at = (pointerId: number, clientX: number, clientY: number) => ({
  pointerId,
  clientX,
  clientY,
});

describe('MapGestures (the stage pointer machine, without the stage)', () => {
  it('a press that barely moves is a tap: no intent, and the click that follows selects', () => {
    const g = new MapGestures();
    expect(g.idle).toBe(true);
    expect(g.down(at(1, 100, 100))).toBe(false);
    expect(g.idle).toBe(false);
    expect(g.move(at(1, 101, 101))).toBeNull();
    g.up(at(1, 101, 101));
    expect(g.wasTap).toBe(true);
    expect(g.idle).toBe(true);
  });

  it('past the threshold, a press on open ground pans by the pointer delta', () => {
    const g = new MapGestures();
    g.down(at(1, 100, 100));
    expect(g.move(at(1, 100 + DRAG_THRESHOLD_PX, 100))).toEqual({
      kind: 'pan',
      dxPx: DRAG_THRESHOLD_PX,
      dyPx: 0,
    });
    expect(g.move(at(1, 100 + DRAG_THRESHOLD_PX, 90))).toEqual({ kind: 'pan', dxPx: 0, dyPx: -10 });
    expect(g.wasTap).toBe(false);
  });

  it('a press on an armed bed drags that bed instead of the camera', () => {
    const g = new MapGestures();
    g.armBed(7);
    g.down(at(1, 0, 0));
    expect(g.move(at(1, 12, 3))).toEqual({ kind: 'drag', plantId: 7, dxPx: 12, dyPx: 3 });
    g.up(at(1, 12, 3));
    // The bed is disarmed on release: the next press on the ground pans.
    g.down(at(2, 0, 0));
    expect(g.move(at(2, 12, 0))?.kind).toBe('pan');
  });

  it('samples from a pointer that never pressed are ignored', () => {
    const g = new MapGestures();
    expect(g.move(at(9, 50, 50))).toBeNull();
  });

  it('a second finger is a pinch: zoom by the gap ratio around the midpoint, never a bed drag', () => {
    const g = new MapGestures();
    g.armBed(7);
    g.down(at(1, 0, 0));
    expect(g.down(at(2, 100, 0))).toBe(true);
    expect(g.move(at(2, 200, 0))).toEqual({ kind: 'pinch', factor: 2, midpoint: { x: 100, y: 0 } });
    // The ratio is against the previous sample, not the first.
    expect(g.move(at(2, 100, 0))).toEqual({
      kind: 'pinch',
      factor: 0.5,
      midpoint: { x: 50, y: 0 },
    });
  });

  it('when one finger lifts, the pan re-anchors to the finger that stays', () => {
    const g = new MapGestures();
    g.down(at(1, 0, 0));
    g.down(at(2, 100, 0));
    g.move(at(1, 10, 0)); // the pinch sample moved pointer 1 to x=10
    g.up(at(2, 100, 0));
    // The delta is from pointer 1's last position, not from the lifted finger.
    expect(g.move(at(1, 30, 0))).toEqual({ kind: 'pan', dxPx: 20, dyPx: 0 });
  });

  it('two fingers at the same spot cannot zoom (no gap to compare)', () => {
    const g = new MapGestures();
    g.down(at(1, 0, 0));
    g.down(at(2, 0, 0));
    expect(g.move(at(2, 10, 0))).toBeNull(); // the first gap was 0
    expect(g.move(at(2, 20, 0))).toEqual({ kind: 'pinch', factor: 2, midpoint: { x: 10, y: 0 } });
  });
});
