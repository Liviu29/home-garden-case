import { GardenRepository } from '../database/repositories/garden.repository';
import { PlantRepository } from '../database/repositories/plant.repository';
import { Garden, GardenUpdate, NewGarden } from '../database/types';
import { createGardenSchema, updateGardenSchema } from '../schemas/garden.schema';
import { NotFoundError, ValidationError } from '../shared/errors';

export class GardenService {
  private readonly gardenRepository: GardenRepository;
  private readonly plantRepository: PlantRepository;

  constructor(opts: { gardenRepository: GardenRepository; plantRepository: PlantRepository }) {
    this.gardenRepository = opts.gardenRepository;
    this.plantRepository = opts.plantRepository;
  }

  /**
   * Get all gardens
   */
  async getAllGardens(): Promise<Garden[]> {
    return await this.gardenRepository.findAll();
  }

  /**
   * Get a garden by ID
   * @throws Error if garden not found
   */
  async getGardenById(gardenId: number): Promise<Garden> {
    const garden = await this.gardenRepository.findById(gardenId);
    if (!garden) {
      throw new NotFoundError(`Garden with ID ${gardenId} not found`);
    }
    return garden;
  }

  /**
   * Create a new garden
   * @throws Error if validation fails
   */
  async createGarden(data: NewGarden): Promise<Garden> {
    // Validate with Zod schema
    const validatedData = createGardenSchema.parse(data);

    return await this.gardenRepository.create(validatedData);
  }

  /**
   * Update a garden
   * @throws Error if garden not found, validation fails, or the new surface
   * is smaller than the area its plants already need
   */
  async updateGarden(gardenId: number, data: GardenUpdate): Promise<Garden> {
    // Verify garden exists
    const existingGarden = await this.gardenRepository.findById(gardenId);
    if (!existingGarden) {
      throw new NotFoundError(`Garden with ID ${gardenId} not found`);
    }

    // Validate with Zod schema
    const validatedData = updateGardenSchema.parse(data);

    // The capacity rule holds in both directions: plants may not outgrow the
    // garden, and the garden may not shrink below its plants.
    const plants = await this.plantRepository.findByGardenId(gardenId);
    const usedArea = plants.reduce((sum, plant) => sum + plant.surfaceAreaRequired, 0);
    if (validatedData.totalSurfaceArea < usedArea) {
      throw new ValidationError(
        `Cannot reduce the garden to ${validatedData.totalSurfaceArea}m²: its plants already require ${usedArea}m²`,
      );
    }

    return await this.gardenRepository.update(gardenId, validatedData);
  }

  /**
   * Delete a garden
   * @throws Error if garden not found
   */
  async deleteGarden(gardenId: number): Promise<void> {
    const garden = await this.gardenRepository.findById(gardenId);
    if (!garden) {
      throw new NotFoundError(`Garden with ID ${gardenId} not found`);
    }

    const deleted = await this.gardenRepository.delete(gardenId);
    if (!deleted) {
      throw new Error(`Failed to delete garden with ID ${gardenId}`);
    }
  }
}
