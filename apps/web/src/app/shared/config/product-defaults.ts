import { ValuePresetOption } from '../ui/value-presets/value-presets';

/**
 * Product-level default suggestions for the create/edit forms.
 * These are UX conveniences — NOT backend constraints and NOT
 * botanical facts. The API accepts any garden area ≥ 0 and any humidity 0–100;
 * these chips just make the common cases one click. The capacity domain rule
 * (Σ surfaceAreaRequired ≤ totalSurfaceArea) remains the only authority.
 */

export const GARDEN_SIZE_PRESETS: readonly ValuePresetOption[] = [
  { label: 'Small', value: 10, description: '10 m² — a balcony or patio' },
  { label: 'Medium', value: 25, description: '25 m² — a backyard bed', recommended: true },
  { label: 'Large', value: 50, description: '50 m² — a serious allotment' },
];

export const TARGET_HUMIDITY_PRESETS: readonly ValuePresetOption[] = [
  { label: 'Dry', value: 40, description: '40% — succulents, mediterranean herbs' },
  { label: 'Balanced', value: 60, description: '60% — most vegetables', recommended: true },
  { label: 'Humid', value: 80, description: '80% — tropicals, ferns' },
];

/** Convenient area quick-picks; any custom value stays first-class. */
export const PLANT_AREA_PRESETS: readonly ValuePresetOption[] = [
  { label: 'Compact', value: 0.5, description: '0.5 m²' },
  { label: 'Standard', value: 1, description: '1 m²' },
  { label: 'Spreading', value: 2, description: '2 m²' },
];
