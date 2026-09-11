import { GardenRepository } from '../database/repositories/garden.repository';
import { UserRepository } from '../database/repositories/user.repository';
import { NewUser, User, UserUpdate } from '../database/types';
import { createUserSchema, updateUserSchema } from '../schemas/user.schema';
import { ConflictError, NotFoundError } from '../shared/errors';

export class UserService {
  private readonly userRepository: UserRepository;
  private readonly gardenRepository: GardenRepository;

  constructor(opts: { userRepository: UserRepository; gardenRepository: GardenRepository }) {
    this.userRepository = opts.userRepository;
    this.gardenRepository = opts.gardenRepository;
  }

  /**
   * Get all users
   */
  async getAllUsers(): Promise<User[]> {
    return await this.userRepository.findAll();
  }

  /**
   * Get a user by ID
   * @throws Error if user not found
   */
  async getUserById(userId: number): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError(`User with ID ${userId} not found`);
    }
    return user;
  }

  /**
   * Get a user by email address
   * @throws Error if user not found
   */
  async getUserByEmail(emailAddress: string): Promise<User> {
    const user = await this.userRepository.findByEmail(emailAddress);
    if (!user) {
      throw new NotFoundError(`User with email ${emailAddress} not found`);
    }
    return user;
  }

  /**
   * Check if a user exists by email address
   */
  async userExistsByEmail(emailAddress: string): Promise<boolean> {
    const user = await this.userRepository.findByEmail(emailAddress);
    return user !== undefined;
  }

  /**
   * Create a new user
   * @throws Error if email already exists
   */
  async createUser(data: NewUser): Promise<User> {
    // Validate with Zod schema
    const validatedData = createUserSchema.parse(data);

    // Check if user with this email already exists
    const existingUser = await this.userRepository.findByEmail(validatedData.emailAddress);
    if (existingUser) {
      throw new ConflictError(`User with email ${validatedData.emailAddress} already exists`);
    }

    return await this.userRepository.create(validatedData);
  }

  /**
   * Update a user
   * @throws Error if user not found or email already in use by another user
   */
  async updateUser(userId: number, data: UserUpdate): Promise<User> {
    // Verify user exists
    const existingUser = await this.userRepository.findById(userId);
    if (!existingUser) {
      throw new NotFoundError(`User with ID ${userId} not found`);
    }

    // Validate with Zod schema
    const validatedData = updateUserSchema.parse(data);

    // If email is being updated, check if it's already in use
    if (validatedData.emailAddress && validatedData.emailAddress !== existingUser.emailAddress) {
      const userWithEmail = await this.userRepository.findByEmail(validatedData.emailAddress);
      if (userWithEmail && userWithEmail.userId !== userId) {
        throw new ConflictError(
          `Email ${validatedData.emailAddress} is already in use by another user`,
        );
      }
    }

    return await this.userRepository.update(userId, validatedData);
  }

  /**
   * Delete a user
   * @throws Error if user not found
   */
  async deleteUser(userId: number): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError(`User with ID ${userId} not found`);
    }

    // Its gardens outlive it, shared with every profile (ADR-009). Done
    // explicitly rather than trusting SQLite's foreign-key setting.
    await this.gardenRepository.releaseOwnedBy(userId);
    const deleted = await this.userRepository.delete(userId);
    if (!deleted) {
      throw new Error(`Failed to delete user with ID ${userId}`);
    }
  }
}
