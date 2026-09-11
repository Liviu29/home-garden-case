import { GardenRepository } from '../database/repositories/garden.repository';
import { PlantRepository } from '../database/repositories/plant.repository';
import { UserRepository } from '../database/repositories/user.repository';
import { Garden, GardenUpdate, NewGarden } from '../database/types';
import { createGardenSchema, updateGardenSchema } from '../schemas/garden.schema';
import { NotFoundError, ValidationError } from '../shared/errors';

export class GardenService {
  private readonly gardenRepository: GardenRepository;
  private readonly plantRepository: PlantRepository;
  private readonly userRepository: UserRepository;

  constructor(opts: {
    gardenRepository: GardenRepository;
    plantRepository: PlantRepository;
    userRepository: UserRepository;
  }) {
    this.gardenRepository = opts.gardenRepository;
    this.plantRepository = opts.plantRepository;
    this.userRepository = opts.userRepository;
  }

  /**
   * Get all gardens — with `visibleTo`, that profile's gardens plus the
   * shared ones.
   */
  async getAllGardens(visibleTo?: number): Promise<Garden[]> {
    return await this.gardenRepository.findAll(visibleTo);
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
   * @throws Error if validation fails or the owning profile does not exist
   */
  async createGarden(data: NewGarden): Promise<Garden> {
    // Validate with Zod schema
    const validatedData = createGardenSchema.parse(data);
    await this.assertOwnerExists(validatedData.userId);

    return await this.gardenRepository.create(validatedData);
  }

  /**
   * Update a garden
   * @throws Error if garden not found, validation fails, the owning profile
   * does not exist, or the new surface is smaller than the area its plants
   * already need
   */
  async updateGarden(gardenId: number, data: GardenUpdate): Promise<Garden> {
    // Verify garden exists
    const existingGarden = await this.gardenRepository.findById(gardenId);
    if (!existingGarden) {
      throw new NotFoundError(`Garden with ID ${gardenId} not found`);
    }

    // Validate with Zod schema
    const validatedData = updateGardenSchema.parse(data);
    await this.assertOwnerExists(validatedData.userId);

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

  /** An owner, when given, must be a real profile (400, not a foreign-key 500). */
  private async assertOwnerExists(userId: number | null | undefined): Promise<void> {
    if (userId === null || userId === undefined) {
      return;
    }
    if (!(await this.userRepository.findById(userId))) {
      throw new ValidationError(`Profile with ID ${userId} not found`);
    }
  }
}
