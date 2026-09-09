import { z } from 'zod/v4';

export const gardenIdParamsSchema = z.object({
  gardenId: z.coerce.number().int().positive('Garden ID must be a positive integer'),
});

z.globalRegistry.add(gardenIdParamsSchema, { id: 'GardenId' });

export const createGardenSchema = z
  .object({
    gardenName: z.string().min(1, 'Garden name is required').trim(),
    totalSurfaceArea: z.number().nonnegative('Total surface area must be a non-negative number'),
    targetHumidityLevel: z
      .number()
      .min(0, 'Target humidity level must be between 0 and 100')
      .max(100, 'Target humidity level must be between 0 and 100')
      .default(50),
    locationDescription: z.string().nullable().optional(),
    latitude: z
      .number()
      .min(-90, 'Latitude must be between -90 and 90')
      .max(90, 'Latitude must be between -90 and 90')
      .nullable()
      .optional(),
    longitude: z
      .number()
      .min(-180, 'Longitude must be between -180 and 180')
      .max(180, 'Longitude must be between -180 and 180')
      .nullable()
      .optional(),
  })
  .refine(
    (data) => {
      const hasLat = data.latitude !== null && data.latitude !== undefined;
      const hasLng = data.longitude !== null && data.longitude !== undefined;
      // Both must be provided together or neither
      return hasLat === hasLng;
    },
    {
      message: 'Both latitude and longitude must be provided together',
    },
  );

z.globalRegistry.add(createGardenSchema, { id: 'CreateGarden' });

export const updateGardenSchema = createGardenSchema;

z.globalRegistry.add(updateGardenSchema, { id: 'UpdateGarden' });

export const gardenResponseSchema = createGardenSchema.safeExtend({
  gardenId: z.number(),
  createdAt: z.coerce.string(),
  updatedAt: z.coerce.string(),
});

z.globalRegistry.add(gardenResponseSchema, { id: 'Garden' });

export const gardensResponseSchema = z.array(gardenResponseSchema);

z.globalRegistry.add(gardensResponseSchema, { id: 'Gardens' });
