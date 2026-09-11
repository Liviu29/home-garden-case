import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { Database } from './types';

// `DB_PATH` picks the database file; the API's own tests use ':memory:'.
const dialect = new SqliteDialect({
  database: new SQLite(process.env['DB_PATH'] ?? 'db.sqlite'),
});

export class DatabaseConnection {
  public readonly db: Kysely<Database>;

  constructor() {
    this.db = new Kysely<Database>({
      dialect,
    });
  }
}
