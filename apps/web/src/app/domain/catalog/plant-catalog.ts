import { Plant } from '../../core/api/models';

/**
 * Curated plant catalog — PRESENTATIONAL presets, not
 * backend data. `suggested*` values are recommendations the user can edit
 * freely; the only authorities remain the form validators and the server's
 * capacity verdict. Visuals come from the same original artwork system as the
 * map (PlantThumb), so the picker, table and planner share one language.
 */
export interface PlantPreset {
  readonly id: string;
  readonly commonName: string;
  readonly scientificName: string;
  /** Domain plantType sent to the backend when picked. */
  readonly plantType: Plant['plantType'];
  /** m² — a sensible starting footprint, editable. */
  readonly suggestedArea: number;
  /** % — a sensible ideal humidity, editable. */
  readonly suggestedHumidity: number;
  readonly description: string;
}

export const PLANT_CATALOG: readonly PlantPreset[] = [
  {
    id: 'tomato',
    commonName: 'Tomato',
    scientificName: 'Solanum lycopersicum',
    plantType: 'vegetable',
    suggestedArea: 0.8,
    suggestedHumidity: 65,
    description: 'Sun-loving classic; steady moisture.',
  },
  {
    id: 'cherry-tomato',
    commonName: 'Cherry Tomato',
    scientificName: 'Solanum lycopersicum var. cerasiforme',
    plantType: 'vegetable',
    suggestedArea: 0.6,
    suggestedHumidity: 65,
    description: 'Compact, prolific, container-friendly.',
  },
  {
    id: 'pepper',
    commonName: 'Bell Pepper',
    scientificName: 'Capsicum annuum',
    plantType: 'vegetable',
    suggestedArea: 0.5,
    suggestedHumidity: 60,
    description: 'Warmth and even watering.',
  },
  {
    id: 'lettuce',
    commonName: 'Lettuce',
    scientificName: 'Lactuca sativa',
    plantType: 'vegetable',
    suggestedArea: 0.3,
    suggestedHumidity: 70,
    description: 'Fast, shade-tolerant, thirsty.',
  },
  {
    id: 'cucumber',
    commonName: 'Cucumber',
    scientificName: 'Cucumis sativus',
    plantType: 'vegetable',
    suggestedArea: 1,
    suggestedHumidity: 70,
    description: 'Climber; loves humidity.',
  },
  {
    id: 'zucchini',
    commonName: 'Zucchini',
    scientificName: 'Cucurbita pepo',
    plantType: 'vegetable',
    suggestedArea: 1.5,
    suggestedHumidity: 62,
    description: 'Big leaves, big appetite for space.',
  },
  {
    id: 'carrot',
    commonName: 'Carrot',
    scientificName: 'Daucus carota',
    plantType: 'vegetable',
    suggestedArea: 0.4,
    suggestedHumidity: 55,
    description: 'Deep loose soil, moderate water.',
  },
  {
    id: 'basil',
    commonName: 'Basil',
    scientificName: 'Ocimum basilicum',
    plantType: 'vegetable',
    suggestedArea: 0.3,
    suggestedHumidity: 60,
    description: 'Pinch often; hates cold.',
  },
  {
    id: 'mint',
    commonName: 'Mint',
    scientificName: 'Mentha spicata',
    plantType: 'vegetable',
    suggestedArea: 0.4,
    suggestedHumidity: 70,
    description: 'Vigorous — contain its roots.',
  },
  {
    id: 'rosemary',
    commonName: 'Rosemary',
    scientificName: 'Salvia rosmarinus',
    plantType: 'vegetable',
    suggestedArea: 0.6,
    suggestedHumidity: 40,
    description: 'Mediterranean; dry and sunny.',
  },
  {
    id: 'thyme',
    commonName: 'Thyme',
    scientificName: 'Thymus vulgaris',
    plantType: 'vegetable',
    suggestedArea: 0.3,
    suggestedHumidity: 40,
    description: 'Low, tough ground cover.',
  },
  {
    id: 'sage',
    commonName: 'Sage',
    scientificName: 'Salvia officinalis',
    plantType: 'vegetable',
    suggestedArea: 0.5,
    suggestedHumidity: 45,
    description: 'Silvery, drought-tolerant.',
  },
  {
    id: 'strawberry',
    commonName: 'Strawberry',
    scientificName: 'Fragaria × ananassa',
    plantType: 'fruit',
    suggestedArea: 0.5,
    suggestedHumidity: 60,
    description: 'Runners spread; mulch well.',
  },
  {
    id: 'blueberry',
    commonName: 'Blueberry',
    scientificName: 'Vaccinium corymbosum',
    plantType: 'fruit',
    suggestedArea: 1.2,
    suggestedHumidity: 65,
    description: 'Acid soil, shallow roots.',
  },
  {
    id: 'raspberry',
    commonName: 'Raspberry',
    scientificName: 'Rubus idaeus',
    plantType: 'fruit',
    suggestedArea: 1.5,
    suggestedHumidity: 60,
    description: 'Canes need a little support.',
  },
  {
    id: 'cherry-tree',
    commonName: 'Cherry Tree',
    scientificName: 'Prunus avium',
    plantType: 'fruit',
    suggestedArea: 6,
    suggestedHumidity: 55,
    description: 'A real tree — give it room.',
  },
  {
    id: 'apple-tree',
    commonName: 'Apple Tree',
    scientificName: 'Malus domestica',
    plantType: 'fruit',
    suggestedArea: 5,
    suggestedHumidity: 55,
    description: 'Classic orchard anchor.',
  },
  {
    id: 'pear-tree',
    commonName: 'Pear Tree',
    scientificName: 'Pyrus communis',
    plantType: 'fruit',
    suggestedArea: 5,
    suggestedHumidity: 55,
    description: 'Upright grower, patient fruiter.',
  },
  {
    id: 'rose',
    commonName: 'Rose',
    scientificName: 'Rosa × hybrida',
    plantType: 'flower',
    suggestedArea: 0.8,
    suggestedHumidity: 55,
    description: 'Feed well, deadhead often.',
  },
  {
    id: 'lavender',
    commonName: 'Lavender',
    scientificName: 'Lavandula angustifolia',
    plantType: 'flower',
    suggestedArea: 1,
    suggestedHumidity: 45,
    description: 'Dry, sunny, bee heaven.',
  },
  {
    id: 'tulip',
    commonName: 'Tulip',
    scientificName: 'Tulipa gesneriana',
    plantType: 'flower',
    suggestedArea: 0.3,
    suggestedHumidity: 50,
    description: 'Autumn bulbs, spring show.',
  },
  {
    id: 'sunflower',
    commonName: 'Sunflower',
    scientificName: 'Helianthus annuus',
    plantType: 'flower',
    suggestedArea: 0.5,
    suggestedHumidity: 55,
    description: 'Tall, fast, cheerful.',
  },
  {
    id: 'hydrangea',
    commonName: 'Hydrangea',
    scientificName: 'Hydrangea macrophylla',
    plantType: 'flower',
    suggestedArea: 1.5,
    suggestedHumidity: 70,
    description: 'Thirsty; shade-tolerant.',
  },
  {
    id: 'hosta',
    commonName: 'Hosta',
    scientificName: 'Hosta sieboldiana',
    plantType: 'flower',
    suggestedArea: 0.8,
    suggestedHumidity: 65,
    description: 'Lush foliage for shade.',
  },
  {
    id: 'fern',
    commonName: 'Garden Fern',
    scientificName: 'Dryopteris filix-mas',
    plantType: 'flower',
    suggestedArea: 0.6,
    suggestedHumidity: 75,
    description: 'Cool, damp, green all season.',
  },
  {
    id: 'boxwood',
    commonName: 'Boxwood',
    scientificName: 'Buxus sempervirens',
    plantType: 'flower',
    suggestedArea: 1,
    suggestedHumidity: 50,
    description: 'Clips into tidy structure.',
  },
  {
    id: 'succulent',
    commonName: 'Succulent Bed',
    scientificName: 'Echeveria elegans',
    plantType: 'flower',
    suggestedArea: 0.4,
    suggestedHumidity: 30,
    description: 'Nearly no water at all.',
  },
] as const;

/** Case-insensitive substring search over common + scientific names. */
export function searchCatalog(query: string): readonly PlantPreset[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return PLANT_CATALOG;
  }
  return PLANT_CATALOG.filter(
    (p) => p.commonName.toLowerCase().includes(q) || p.scientificName.toLowerCase().includes(q),
  );
}
