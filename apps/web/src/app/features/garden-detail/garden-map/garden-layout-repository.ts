import { Injectable } from '@angular/core';

/**
 * Browser-local persistence for the planner's VISUAL layout (feature brief
 * §16/§61). Positions are UI preference state — the backend has no
 * coordinates and never will for this case; capacity math never reads them.
 *
 * Storage format is versioned (`v1`); corrupt or unavailable storage
 * degrades silently to the deterministic auto-layout.
 */

interface PlantPosition {
  readonly x: number;
  readonly y: number;
}

export type LayoutPositions = Readonly<Record<number, PlantPosition>>;

interface GardenVisualLayoutV1 {
  readonly v: 1;
  readonly positions: Record<number, PlantPosition>;
}

const KEY_PREFIX = 'homeGarden.visualLayout.v1.';

@Injectable({ providedIn: 'root' })
export class GardenLayoutRepository {
  load(gardenId: number): LayoutPositions {
    try {
      const raw = localStorage.getItem(KEY_PREFIX + gardenId);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw) as Partial<GardenVisualLayoutV1>;
      if (parsed.v !== 1 || typeof parsed.positions !== 'object' || parsed.positions === null) {
        return {};
      }
      const positions: Record<number, PlantPosition> = {};
      for (const [id, pos] of Object.entries(parsed.positions)) {
        const plantId = Number(id);
        if (
          Number.isFinite(plantId) &&
          pos &&
          typeof pos.x === 'number' &&
          typeof pos.y === 'number' &&
          Number.isFinite(pos.x) &&
          Number.isFinite(pos.y)
        ) {
          positions[plantId] = { x: pos.x, y: pos.y };
        }
      }
      return positions;
    } catch {
      return {}; // corrupt/unavailable storage — auto-layout still works
    }
  }

  /** Persists only positions for plants that still exist (pruning deletes). */
  save(gardenId: number, positions: LayoutPositions, existingPlantIds: readonly number[]): void {
    try {
      const pruned: Record<number, PlantPosition> = {};
      for (const id of existingPlantIds) {
        const pos = positions[id];
        if (pos) {
          pruned[id] = pos;
        }
      }
      if (Object.keys(pruned).length === 0) {
        localStorage.removeItem(KEY_PREFIX + gardenId);
        return;
      }
      const payload: GardenVisualLayoutV1 = { v: 1, positions: pruned };
      localStorage.setItem(KEY_PREFIX + gardenId, JSON.stringify(payload));
    } catch {
      // storage unavailable — layout simply won't survive reloads
    }
  }

  reset(gardenId: number): void {
    try {
      localStorage.removeItem(KEY_PREFIX + gardenId);
    } catch {
      // nothing to do
    }
  }
}
