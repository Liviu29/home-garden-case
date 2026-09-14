/**
 * The API's contract, as one import: the zod schemas every route validates
 * with, and the types they infer.
 *
 * The web app imports the types only (`import type … from
 * '@itp-home-garden/api-contract'`, resolved by a tsconfig path), so a
 * change to a schema is a compile error on the client that reads it, and
 * nothing of the API — zod included — reaches the browser bundle. The
 * schemas themselves stay next to the routes that use them (ADR-006).
 */
import type { z } from 'zod/v4';
import type {
  createGardenSchema,
  gardenResponseSchema,
  updateGardenSchema,
} from '../app/schemas/garden.schema';
import type {
  createPlantSchema,
  plantResponseSchema,
  updatePlantSchema,
} from '../app/schemas/plant.schema';
import type {
  createUserSchema,
  updateUserSchema,
  userResponseSchema,
} from '../app/schemas/user.schema';
import type { validationErrorResponseSchema } from '../app/schemas/error.schema';

export {
  createGardenSchema,
  gardenResponseSchema,
  updateGardenSchema,
} from '../app/schemas/garden.schema';
export {
  createPlantSchema,
  plantResponseSchema,
  updatePlantSchema,
} from '../app/schemas/plant.schema';
export { createUserSchema, updateUserSchema, userResponseSchema } from '../app/schemas/user.schema';
export { validationErrorResponseSchema } from '../app/schemas/error.schema';

// ── What the API answers ────────────────────────────────────────────────────
export type GardenDto = z.infer<typeof gardenResponseSchema>;
export type PlantDto = z.infer<typeof plantResponseSchema>;
export type UserDto = z.infer<typeof userResponseSchema>;
export type ErrorResponseDto = z.infer<typeof validationErrorResponseSchema>;

// ── What the API accepts ────────────────────────────────────────────────────
export type CreateGardenBody = z.input<typeof createGardenSchema>;
export type UpdateGardenBody = z.input<typeof updateGardenSchema>;
export type CreatePlantBody = z.input<typeof createPlantSchema>;
export type UpdatePlantBody = z.input<typeof updatePlantSchema>;
export type CreateUserBody = z.input<typeof createUserSchema>;
export type UpdateUserBody = z.input<typeof updateUserSchema>;
