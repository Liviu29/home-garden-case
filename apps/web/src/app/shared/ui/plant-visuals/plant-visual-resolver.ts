import { Plant } from '../../../core/api/models';

/**
 * Pure, presentational plant-visual resolution (ADR-007 §visual layer).
 *
 * Maps arbitrary API plant names/species onto a small curated set of original
 * botanical SVG symbols via keyword heuristics, with the plant's `plantType`
 * as the safe fallback. Everything is DETERMINISTIC — seeded from the plant's
 * identity, never Math.random() — so a garden looks identical on every visit.
 *
 * This layer never touches domain data: capacity comes from garden-insights,
 * geometry from garden-map-layout; the visual is paint inside that footprint.
 */

type PlantVisualCategory =
  'tree' | 'shrub' | 'flower' | 'herb' | 'vegetable' | 'fruit' | 'succulent' | 'generic';

interface PlantPalette {
  /** Foliage base / foliage light / accent (fruit, petals, veins). */
  readonly a: string;
  readonly b: string;
  readonly c: string;
}

export interface PlantVisual {
  readonly category: PlantVisualCategory;
  /** Symbol id from PlantArtworkDefs, e.g. "pv-flower". */
  readonly symbolId: string;
  readonly palette: PlantPalette;
  /** Subtle deterministic base rotation in degrees (−14…14). */
  readonly rotation: number;
  /** Deterministic variation seed for cluster jitter. */
  readonly seed: number;
}

/** Checked in order — the first matching category wins (most specific first). */
const KEYWORDS: ReadonlyArray<readonly [PlantVisualCategory, readonly string[]]> = [
  ['succulent', ['succulent', 'cactus', 'aloe', 'agave', 'echeveria', 'sedum']],
  [
    'herb',
    [
      'basil',
      'mint',
      'thyme',
      'rosemary',
      'sage',
      'oregano',
      'parsley',
      'chive',
      'dill',
      'cilantro',
      'coriander',
      'fern',
      'grass',
      'herb',
    ],
  ],
  [
    'vegetable',
    [
      'tomato',
      'carrot',
      'lettuce',
      'zucchini',
      'courgette',
      'pumpkin',
      'pepper',
      'cucumber',
      'bean',
      'pea',
      'cabbage',
      'kale',
      'onion',
      'potato',
      'spinach',
      'broccoli',
      'radish',
      'beet',
    ],
  ],
  [
    'fruit',
    ['strawberr', 'raspberr', 'blueberr', 'berry', 'currant', 'grape', 'melon', 'fragaria'],
  ],
  [
    'flower',
    [
      'rose',
      'tulip',
      'dahlia',
      'orchid',
      'daisy',
      'sunflower',
      'lavender',
      'lavandula',
      'peony',
      'lily',
      'marigold',
      'petunia',
      'iris',
      'poppy',
      'flower',
      'bloom',
    ],
  ],
  // After fruit and flower, so "blueberry bush" and "rose bush" keep theirs.
  [
    'shrub',
    [
      'boxwood',
      'buxus',
      'hedge',
      'hydrangea',
      'azalea',
      'rhododendron',
      'juniper',
      'holly',
      'privet',
      'shrub',
      'bush',
    ],
  ],
  [
    'tree',
    [
      'tree',
      'oak',
      'maple',
      'birch',
      'willow',
      'olive',
      'citrus',
      'lemon',
      'apple',
      'pear',
      'plum',
      'ficus',
      'palm',
      'cherry',
    ],
  ],
] as const;

/** Naturalistic palettes per category; the seed picks one. Fixed across themes. */
const PALETTES: Readonly<Record<PlantVisualCategory, readonly PlantPalette[]>> = {
  shrub: [
    { a: '#3f7d4e', b: '#5ea36c', c: '#8cc63f' },
    { a: '#35704a', b: '#54935f', c: '#a2c65a' },
  ],
  generic: [
    { a: '#4b8a58', b: '#6fae77', c: '#b7d98b' },
    { a: '#41815b', b: '#63a06e', c: '#a8cf7e' },
  ],
  flower: [
    { a: '#4c8452', b: '#d977a6', c: '#f2c94c' },
    { a: '#477e54', b: '#a06bd1', c: '#f4e04d' },
    { a: '#4c8452', b: '#e2685f', c: '#f7d154' },
  ],
  herb: [
    { a: '#5c9a53', b: '#83bb6f', c: '#c8e29a' },
    { a: '#52905b', b: '#79b271', c: '#bdd98f' },
  ],
  vegetable: [
    { a: '#3f7d4e', b: '#61a065', c: '#e0533f' },
    { a: '#417a45', b: '#5f9d5d', c: '#e88f2a' },
  ],
  fruit: [
    { a: '#3c724a', b: '#578f5d', c: '#c62f45' },
    { a: '#39694a', b: '#4f8557', c: '#7c3aed' },
  ],
  tree: [
    { a: '#2f6a44', b: '#4c8a58', c: '#1e4a30' },
    { a: '#33724d', b: '#549264', c: '#234f36' },
  ],
  succulent: [
    { a: '#4f8f7e', b: '#74b09b', c: '#dbeee2' },
    { a: '#568b8b', b: '#7cadaa', c: '#e4f0ee' },
  ],
};

/** Small deterministic hash → 32-bit uint (identity-stable, order-free). */
function hashPlant(plantId: number, plantName: string): number {
  let h = (plantId * 2654435761) >>> 0;
  for (let i = 0; i < plantName.length; i++) {
    h = (h ^ plantName.charCodeAt(i)) * 16777619;
    h >>>= 0;
  }
  return h >>> 0;
}

export function resolvePlantVisual(
  plant: Pick<Plant, 'plantId' | 'plantName' | 'species' | 'plantType'>,
): PlantVisual {
  const haystack = `${plant.plantName} ${plant.species}`.toLowerCase();
  let category: PlantVisualCategory | null = null;
  for (const [cat, words] of KEYWORDS) {
    if (words.some((w) => haystack.includes(w))) {
      category = cat;
      break;
    }
  }
  if (!category) {
    category =
      plant.plantType === 'vegetable'
        ? 'vegetable'
        : plant.plantType === 'fruit'
          ? 'fruit'
          : plant.plantType === 'flower'
            ? 'flower'
            : 'generic';
  }

  const seed = hashPlant(plant.plantId, plant.plantName);
  const palettes = PALETTES[category];
  return {
    category,
    symbolId: `pv-${category === 'generic' ? 'generic' : category}`,
    palette: palettes[seed % palettes.length],
    rotation: (seed % 29) - 14,
    seed,
  };
}

// ── Vegetation clusters ──────────────────────────────────────────────────────

interface VegInstance {
  /** Center, in the footprint's local coordinates (map units). */
  readonly x: number;
  readonly y: number;
  /** Rendered size (width == height) in map units. */
  readonly size: number;
  readonly rotation: number;
}

/** Deterministic LCG in [0,1). */
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * One plant, rendered as a growth CLUSTER when its honest footprint is large:
 * density follows visual area, positions are seeded by the plant identity,
 * and every instance stays inside the footprint. Purely presentational —
 * the inspector/table still say "1 plant"; capacity never reads from this.
 *
 * `minSize` is the legibility floor for the artwork only (documented: it never
 * affects capacity math — the footprint stays exact).
 */
export function computeVegetation(
  seed: number,
  w: number,
  h: number,
  minSize: number,
): readonly VegInstance[] {
  const rand = lcg(seed);
  const area = w * h;
  // A drawn "specimen" reads as roughly 0.85 map units (≈ m²) of foliage;
  // density follows the honest footprint area from there, capped at 9.
  const unit = Math.max(minSize, 0.85);
  const count = Math.max(1, Math.min(9, Math.round(area / (unit * unit * 1.15))));

  if (count === 1) {
    const size = Math.max(minSize, Math.min(w, h) * 0.88);
    return [
      {
        x: w / 2,
        y: h / 2,
        size: Math.min(size, Math.min(w, h)),
        rotation: Math.round(rand() * 40 - 20),
      },
    ];
  }

  const cols = Math.max(1, Math.round(Math.sqrt((count * w) / h)));
  const rows = Math.ceil(count / cols);
  const cellW = w / cols;
  const cellH = h / rows;
  const instances: VegInstance[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const size = Math.max(minSize, Math.min(cellW, cellH) * (0.86 + rand() * 0.22));
    const clamped = Math.min(size, Math.min(w, h));
    const jitterX = (rand() - 0.5) * cellW * 0.3;
    const jitterY = (rand() - 0.5) * cellH * 0.3;
    const cx = Math.min(Math.max((col + 0.5) * cellW + jitterX, clamped / 2), w - clamped / 2);
    const cy = Math.min(Math.max((row + 0.5) * cellH + jitterY, clamped / 2), h - clamped / 2);
    instances.push({ x: cx, y: cy, size: clamped, rotation: Math.round(rand() * 50 - 25) });
  }
  return instances;
}
