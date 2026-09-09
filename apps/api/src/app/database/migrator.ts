import { Kysely, Migrator } from 'kysely';
import { migration001 } from './migrations/migration001';
import { migration002 } from './migrations/migration002';
import { Database } from './types';

export class MigratorService {
  private readonly db: Kysely<Database>;

  constructor(opts: { db: Kysely<Database> }) {
    this.db = opts.db;
  }

  async migrateToLatest() {
    const migrator = new Migrator({
      db: this.db,
      provider: {
        getMigrations: async () => ({
          migration001,
          migration002,
        }),
      },
    });

    const { error, results } = await migrator.migrateToLatest();

    results?.forEach((it) => {
      if (it.status === 'Success') {
        console.log(`migration "${it.migrationName}" was executed successfully`);
      } else if (it.status === 'Error') {
        console.error(`failed to execute migration "${it.migrationName}"`);
      }
    });

    if (error) {
      console.error('failed to migrate');
      console.error(error);
      process.exit(1);
    }
  }
}
