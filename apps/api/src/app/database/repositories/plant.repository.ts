import { Kysely } from 'kysely';
import { Database, NewPlant, Plant, PlantUpdate } from '../types';

export class PlantRepository {
  private readonly db: Kysely<Database>;

  constructor(opts: { db: Kysely<Database> }) {
    this.db = opts.db;
  }

  /**
   * Find all plants — or, with `visibleTo`, the plants of the gardens that
   * profile owns plus the shared (unowned) ones.
   */
  async findAll(visibleTo?: number): Promise<Plant[]> {
    if (visibleTo === undefined) {
      return await this.db.selectFrom('plant').selectAll().execute();
    }
    return await this.db
      .selectFrom('plant')
      .innerJoin('garden', 'garden.gardenId', 'plant.gardenId')
      .where((eb) => eb.or([eb('garden.userId', '=', visibleTo), eb('garden.userId', 'is', null)]))
      .selectAll('plant')
      .execute();
  }

  /**
   * Find a plant by plantId
   */
  async findById(plantId: number): Promise<Plant | undefined> {
    return await this.db
      .selectFrom('plant')
      .where('plantId', '=', plantId)
      .selectAll()
      .executeTakeFirst();
  }

  /**
   * Find all plants in a specific garden
   */
  async findByGardenId(gardenId: number): Promise<Plant[]> {
    return await this.db.selectFrom('plant').where('gardenId', '=', gardenId).selectAll().execute();
  }

  /**
   * Find plants by type
   */
  async findByType(plantType: 'vegetable' | 'fruit' | 'flower'): Promise<Plant[]> {
    return await this.db
      .selectFrom('plant')
      .where('plantType', '=', plantType)
      .selectAll()
      .execute();
  }

  /**
   * Find plants by species
   */
  async findBySpecies(species: string): Promise<Plant[]> {
    return await this.db.selectFrom('plant').where('species', '=', species).selectAll().execute();
  }

  /**
   * Create a new plant
   */
  async create(data: NewPlant): Promise<Plant> {
    const result = await this.db
      .insertInto('plant')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();

    return result;
  }

  /**
   * Update a plant by plantId
   */
  async update(plantId: number, data: PlantUpdate): Promise<Plant> {
    const result = await this.db
      .updateTable('plant')
      .set(data)
      .where('plantId', '=', plantId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return result;
  }

  /**
   * Delete a plant by plantId
   */
  async delete(plantId: number): Promise<boolean> {
    const result = await this.db
      .deleteFrom('plant')
      .where('plantId', '=', plantId)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  }
}
