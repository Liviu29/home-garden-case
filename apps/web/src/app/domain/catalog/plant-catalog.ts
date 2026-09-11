import { Plant } from '../../core/api/models';

/**
 * Curated plant catalog — PRESENTATIONAL presets, not
 * backend data. `suggested*` values are recommendations the user can edit
 * freely; the only authorities remain the form validators and the server's
 * capacity verdict. Visuals come from the same original artwork system as the
 * map (PlantThumb), so the picker, table and planner share one language.
 * Common names and descriptions are translated; scientific names never are.
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
    commonName: $localize`Tomato`,
    scientificName: 'Solanum lycopersicum',
    plantType: 'vegetable',
    suggestedArea: 0.8,
    suggestedHumidity: 65,
    description: $localize`Sun-loving classic; steady moisture.`,
  },
  {
    id: 'cherry-tomato',
    commonName: $localize`Cherry Tomato`,
    scientificName: 'Solanum lycopersicum var. cerasiforme',
    plantType: 'vegetable',
    suggestedArea: 0.6,
    suggestedHumidity: 65,
    description: $localize`Compact, prolific, container-friendly.`,
  },
  {
    id: 'pepper',
    commonName: $localize`Bell Pepper`,
    scientificName: 'Capsicum annuum',
    plantType: 'vegetable',
    suggestedArea: 0.5,
    suggestedHumidity: 60,
    description: $localize`Warmth and even watering.`,
  },
  {
    id: 'lettuce',
    commonName: $localize`Lettuce`,
    scientificName: 'Lactuca sativa',
    plantType: 'vegetable',
    suggestedArea: 0.3,
    suggestedHumidity: 70,
    description: $localize`Fast, shade-tolerant, thirsty.`,
  },
  {
    id: 'cucumber',
    commonName: $localize`Cucumber`,
    scientificName: 'Cucumis sativus',
    plantType: 'vegetable',
    suggestedArea: 1,
    suggestedHumidity: 70,
    description: $localize`Climber; loves humidity.`,
  },
  {
    id: 'zucchini',
    commonName: $localize`Zucchini`,
    scientificName: 'Cucurbita pepo',
    plantType: 'vegetable',
    suggestedArea: 1.5,
    suggestedHumidity: 62,
    description: $localize`Big leaves, big appetite for space.`,
  },
  {
    id: 'carrot',
    commonName: $localize`Carrot`,
    scientificName: 'Daucus carota',
    plantType: 'vegetable',
    suggestedArea: 0.4,
    suggestedHumidity: 55,
    description: $localize`Deep loose soil, moderate water.`,
  },
  {
    id: 'basil',
    commonName: $localize`Basil`,
    scientificName: 'Ocimum basilicum',
    plantType: 'vegetable',
    suggestedArea: 0.3,
    suggestedHumidity: 60,
    description: $localize`Pinch often; hates cold.`,
  },
  {
    id: 'mint',
    commonName: $localize`Mint`,
    scientificName: 'Mentha spicata',
    plantType: 'vegetable',
    suggestedArea: 0.4,
    suggestedHumidity: 70,
    description: $localize`Vigorous — contain its roots.`,
  },
  {
    id: 'rosemary',
    commonName: $localize`Rosemary`,
    scientificName: 'Salvia rosmarinus',
    plantType: 'vegetable',
    suggestedArea: 0.6,
    suggestedHumidity: 40,
    description: $localize`Mediterranean; dry and sunny.`,
  },
  {
    id: 'thyme',
    commonName: $localize`Thyme`,
    scientificName: 'Thymus vulgaris',
    plantType: 'vegetable',
    suggestedArea: 0.3,
    suggestedHumidity: 40,
    description: $localize`Low, tough ground cover.`,
  },
  {
    id: 'sage',
    commonName: $localize`Sage`,
    scientificName: 'Salvia officinalis',
    plantType: 'vegetable',
    suggestedArea: 0.5,
    suggestedHumidity: 45,
    description: $localize`Silvery, drought-tolerant.`,
  },
  {
    id: 'strawberry',
    commonName: $localize`Strawberry`,
    scientificName: 'Fragaria × ananassa',
    plantType: 'fruit',
    suggestedArea: 0.5,
    suggestedHumidity: 60,
    description: $localize`Runners spread; mulch well.`,
  },
  {
    id: 'blueberry',
    commonName: $localize`Blueberry`,
    scientificName: 'Vaccinium corymbosum',
    plantType: 'fruit',
    suggestedArea: 1.2,
    suggestedHumidity: 65,
    description: $localize`Acid soil, shallow roots.`,
  },
  {
    id: 'raspberry',
    commonName: $localize`Raspberry`,
    scientificName: 'Rubus idaeus',
    plantType: 'fruit',
    suggestedArea: 1.5,
    suggestedHumidity: 60,
    description: $localize`Canes need a little support.`,
  },
  {
    id: 'cherry-tree',
    commonName: $localize`Cherry Tree`,
    scientificName: 'Prunus avium',
    plantType: 'fruit',
    suggestedArea: 6,
    suggestedHumidity: 55,
    description: $localize`A real tree — give it room.`,
  },
  {
    id: 'apple-tree',
    commonName: $localize`Apple Tree`,
    scientificName: 'Malus domestica',
    plantType: 'fruit',
    suggestedArea: 5,
    suggestedHumidity: 55,
    description: $localize`Classic orchard anchor.`,
  },
  {
    id: 'pear-tree',
    commonName: $localize`Pear Tree`,
    scientificName: 'Pyrus communis',
    plantType: 'fruit',
    suggestedArea: 5,
    suggestedHumidity: 55,
    description: $localize`Upright grower, patient fruiter.`,
  },
  {
    id: 'rose',
    commonName: $localize`Rose`,
    scientificName: 'Rosa × hybrida',
    plantType: 'flower',
    suggestedArea: 0.8,
    suggestedHumidity: 55,
    description: $localize`Feed well, deadhead often.`,
  },
  {
    id: 'lavender',
    commonName: $localize`Lavender`,
    scientificName: 'Lavandula angustifolia',
    plantType: 'flower',
    suggestedArea: 1,
    suggestedHumidity: 45,
    description: $localize`Dry, sunny, bee heaven.`,
  },
  {
    id: 'tulip',
    commonName: $localize`Tulip`,
    scientificName: 'Tulipa gesneriana',
    plantType: 'flower',
    suggestedArea: 0.3,
    suggestedHumidity: 50,
    description: $localize`Autumn bulbs, spring show.`,
  },
  {
    id: 'sunflower',
    commonName: $localize`Sunflower`,
    scientificName: 'Helianthus annuus',
    plantType: 'flower',
    suggestedArea: 0.5,
    suggestedHumidity: 55,
    description: $localize`Tall, fast, cheerful.`,
  },
  {
    id: 'hydrangea',
    commonName: $localize`Hydrangea`,
    scientificName: 'Hydrangea macrophylla',
    plantType: 'flower',
    suggestedArea: 1.5,
    suggestedHumidity: 70,
    description: $localize`Thirsty; shade-tolerant.`,
  },
  {
    id: 'hosta',
    commonName: $localize`Hosta`,
    scientificName: 'Hosta sieboldiana',
    plantType: 'flower',
    suggestedArea: 0.8,
    suggestedHumidity: 65,
    description: $localize`Lush foliage for shade.`,
  },
  {
    id: 'fern',
    commonName: $localize`Garden Fern`,
    scientificName: 'Dryopteris filix-mas',
    plantType: 'flower',
    suggestedArea: 0.6,
    suggestedHumidity: 75,
    description: $localize`Cool, damp, green all season.`,
  },
  {
    id: 'boxwood',
    commonName: $localize`Boxwood`,
    scientificName: 'Buxus sempervirens',
    plantType: 'flower',
    suggestedArea: 1,
    suggestedHumidity: 50,
    description: $localize`Clips into tidy structure.`,
  },
  {
    id: 'succulent',
    commonName: $localize`Succulent Bed`,
    scientificName: 'Echeveria elegans',
    plantType: 'flower',
    suggestedArea: 0.4,
    suggestedHumidity: 30,
    description: $localize`Nearly no water at all.`,
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
