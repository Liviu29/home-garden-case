import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';
import {
  internalServerErrorResponseSchema,
  notFoundErrorResponseSchema,
  validationErrorResponseSchema,
} from '../schemas/error.schema';
import {
  createGardenSchema,
  gardenIdParamsSchema,
  gardenResponseSchema,
  gardensResponseSchema,
  updateGardenSchema,
  visibleToQuerySchema,
} from '../schemas/garden.schema';
import { emptyResponseSchema } from '../schemas/general.schema';
import { GardenService } from '../services/garden.service';

export default async function (fastify: FastifyInstance) {
  const gardenService = fastify.diContainer.resolve<GardenService>('gardenService');

  /**
   * GET /gardens?visibleTo=<userId>
   * Get all gardens — or a profile's gardens plus the shared ones
   */
  fastify.withTypeProvider<ZodTypeProvider>().get<{
    Querystring: z.infer<typeof visibleToQuerySchema>;
  }>(
    '/gardens',
    {
      schema: {
        description:
          "Get all gardens. With visibleTo, only that profile's gardens and the shared (unowned) ones.",
        tags: ['gardens'],
        querystring: visibleToQuerySchema,
        response: {
          200: gardensResponseSchema,
          400: validationErrorResponseSchema,
          500: internalServerErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const gardens = await gardenService.getAllGardens(request.query.visibleTo);
      return reply.send(gardens);
    },
  );

  /**
   * GET /gardens/:gardenId
   * Get a garden by ID
   */
  fastify.withTypeProvider<ZodTypeProvider>().get<{ Params: z.infer<typeof gardenIdParamsSchema> }>(
    '/gardens/:gardenId',
    {
      schema: {
        description: 'Get a garden by ID',
        tags: ['gardens'],
        params: gardenIdParamsSchema,
        response: {
          200: gardenResponseSchema,
          400: validationErrorResponseSchema,
          404: notFoundErrorResponseSchema,
          500: internalServerErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const garden = await gardenService.getGardenById(request.params.gardenId);
      return reply.send(garden);
    },
  );

  /**
   * POST /gardens
   * Create a new garden
   */
  fastify.withTypeProvider<ZodTypeProvider>().post<{
    Body: z.infer<typeof createGardenSchema>;
  }>(
    '/gardens',
    {
      schema: {
        description: 'Create a new garden',
        tags: ['gardens'],
        body: createGardenSchema,
        response: {
          201: gardenResponseSchema,
          400: validationErrorResponseSchema,
          500: internalServerErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const garden = await gardenService.createGarden(request.body);
      return reply.status(201).send(garden);
    },
  );

  /**
   * PUT /gardens/:gardenId
   * Update a garden
   */
  fastify.withTypeProvider<ZodTypeProvider>().put<{
    Params: z.infer<typeof gardenIdParamsSchema>;
    Body: z.infer<typeof updateGardenSchema>;
  }>(
    '/gardens/:gardenId',
    {
      schema: {
        description: 'Update a garden',
        tags: ['gardens'],
        params: gardenIdParamsSchema,
        body: updateGardenSchema,
        response: {
          200: gardenResponseSchema,
          400: validationErrorResponseSchema,
          404: notFoundErrorResponseSchema,
          500: internalServerErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const garden = await gardenService.updateGarden(request.params.gardenId, request.body);
      return reply.send(garden);
    },
  );

  /**
   * DELETE /gardens/:gardenId
   * Delete a garden
   */
  fastify
    .withTypeProvider<ZodTypeProvider>()
    .delete<{ Params: z.infer<typeof gardenIdParamsSchema> }>(
      '/gardens/:gardenId',
      {
        schema: {
          description: 'Delete a garden',
          tags: ['gardens'],
          params: gardenIdParamsSchema,
          response: {
            204: emptyResponseSchema,
            400: validationErrorResponseSchema,
            404: notFoundErrorResponseSchema,
            500: internalServerErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        await gardenService.deleteGarden(request.params.gardenId);
        return reply.status(204).send();
      },
    );
}
