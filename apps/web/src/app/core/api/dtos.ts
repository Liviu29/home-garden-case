/**
 * API DTOs — the API's own contract, imported as types (ADR-006).
 *
 * `@itp-home-garden/api-contract` is a tsconfig path into the API's contract
 * barrel: the types are inferred from the zod schemas the routes validate
 * with, so a contract change fails the client's build instead of drifting
 * quietly. Type-only: nothing of the API reaches the browser.
 */
export type {
  CreateGardenBody,
  CreatePlantBody,
  CreateUserBody,
  ErrorResponseDto,
  GardenDto,
  PlantDto,
  UpdateGardenBody,
  UpdatePlantBody,
  UpdateUserBody,
  UserDto,
} from '@itp-home-garden/api-contract';
