import { Kysely, sql } from 'kysely';
import { Database } from '../types';

/**
 * Adds the configurable "target humidity level" to gardens (case requirement:
 * "Each garden should have a configurable target humidity level (range: 0-100)").
 * Default 50 keeps existing rows valid; range is enforced by the zod schemas.
 */
async function up(db: Kysely<Database>) {
  await db.schema
    .alterTable('garden')
    .addColumn('targetHumidityLevel', 'real', (col) => col.notNull().defaultTo(sql`50`))
    .execute();
}

async function down(db: Kysely<Database>) {
  await db.schema.alterTable('garden').dropColumn('targetHumidityLevel').execute();
}

export const migration002 = {
  up,
  down,
};
