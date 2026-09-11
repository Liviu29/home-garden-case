import AutoLoad from '@fastify/autoload';
import { diContainer, fastifyAwilixPlugin } from '@fastify/awilix';
import { asClass, asFunction } from 'awilix';
import { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import * as path from 'path';
import { DatabaseConnection } from './database/connection';
import { MigratorService } from './database/migrator';
import { GardenRepository } from './database/repositories/garden.repository';
import { PlantRepository } from './database/repositories/plant.repository';
import { UserRepository } from './database/repositories/user.repository';
import { GardenService } from './services/garden.service';
import { PlantService } from './services/plant.service';
import { UserService } from './services/user.service';

/* eslint-disable-next-line */
export interface AppOptions {}

export async function app(fastify: FastifyInstance, opts: AppOptions) {
  diContainer.register({
    dbConnection: asClass(DatabaseConnection).singleton(),
    db: asFunction((deps) => deps.dbConnection.db).singleton(),
    migratorService: asClass(MigratorService).singleton(),
    userRepository: asClass(UserRepository).singleton(),
    gardenRepository: asClass(GardenRepository).singleton(),
    plantRepository: asClass(PlantRepository).singleton(),
    userService: asClass(UserService).singleton(),
    gardenService: asClass(GardenService).singleton(),
    plantService: asClass(PlantService).singleton(),
  });

  // Register fastifyAwilixPlugin before routes so diContainer is available
  fastify.register(fastifyAwilixPlugin, {
    disposeOnClose: true,
    disposeOnResponse: true,
    strictBooleanEnforced: true,
  });

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  // Specs live next to the routes they test; they are not plugins.
  const ignorePattern = /\.spec\.[jt]s$/;

  fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'plugins'),
    ignorePattern,
    options: { ...opts },
  });

  // This loads all plugins defined in routes
  // define your routes in one of these
  fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'routes'),
    ignorePattern,
    options: { ...opts },
  });

  const migrator = diContainer.resolve<MigratorService>('migratorService');
  await migrator.migrateToLatest();
}
