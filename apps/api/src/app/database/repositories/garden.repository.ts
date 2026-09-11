import { Kysely } from 'kysely';
import { Database, Garden, GardenUpdate, NewGarden } from '../types';

export class GardenRepository {
  private readonly db: Kysely<Database>;

  constructor(opts: { db: Kysely<Database> }) {
    this.db = opts.db;
  }

  /**
   * Find all gardens — or, with `visibleTo`, the ones that profile owns plus
   * the shared (unowned) ones.
   */
  async findAll(visibleTo?: number): Promise<Garden[]> {
    let query = this.db.selectFrom('garden').selectAll();
    if (visibleTo !== undefined) {
      query = query.where((eb) => eb.or([eb('userId', '=', visibleTo), eb('userId', 'is', null)]));
    }
    return await query.execute();
  }

  /** Hand a profile's gardens back to everyone (the profile is being deleted). */
  async releaseOwnedBy(userId: number): Promise<void> {
    await this.db
      .updateTable('garden')
      .set({ userId: null })
      .where('userId', '=', userId)
      .execute();
  }

  /**
   * Find a garden by gardenId
   */
  async findById(gardenId: number): Promise<Garden | undefined> {
    return await this.db
      .selectFrom('garden')
      .where('gardenId', '=', gardenId)
      .selectAll()
      .executeTakeFirst();
  }

  /**
   * Create a new garden
   */
  async create(data: NewGarden): Promise<Garden> {
    const result = await this.db
      .insertInto('garden')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();

    return result;
  }

  /**
   * Update a garden by gardenId
   */
  async update(gardenId: number, data: GardenUpdate): Promise<Garden> {
    const result = await this.db
      .updateTable('garden')
      .set(data)
      .where('gardenId', '=', gardenId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return result;
  }

  /**
   * Delete a garden by gardenId
   */
  async delete(gardenId: number): Promise<boolean> {
    const result = await this.db
      .deleteFrom('garden')
      .where('gardenId', '=', gardenId)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  }
}
