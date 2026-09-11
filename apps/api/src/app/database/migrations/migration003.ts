import { Kysely } from 'kysely';
import { Database } from '../types';

/**
 * Gardens get an owner (ADR-009): the profile that created them. Existing
 * rows stay without one — they are "shared" and every profile keeps seeing
 * them, so no data disappears when this migration runs.
 */
async function up(db: Kysely<Database>) {
  await db.schema
    .alterTable('garden')
    .addColumn('userId', 'integer', (col) => col.references('user.userId').onDelete('set null'))
    .execute();
  await db.schema.createIndex('garden_user_id_index').on('garden').column('userId').execute();
}

async function down(db: Kysely<Database>) {
  await db.schema.dropIndex('garden_user_id_index').execute();
  await db.schema.alterTable('garden').dropColumn('userId').execute();
}

export const migration003 = {
  up,
  down,
};
