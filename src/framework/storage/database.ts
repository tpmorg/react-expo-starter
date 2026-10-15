import * as SQLite from 'expo-sqlite';

export interface DatabaseMigration {
  id: string;
  migrate(db: SQLite.SQLiteDatabase): Promise<void>;
}

export class AppDatabase {
  private db: SQLite.SQLiteDatabase | null = null;
  private initialization: Promise<void> | null = null;

  constructor(
    private readonly migrations: readonly DatabaseMigration[],
    private readonly databaseName = 'app.db'
  ) {
    const uniqueIds = new Set(migrations.map((migration) => migration.id));
    if (uniqueIds.size !== migrations.length) {
      throw new Error('Database migration IDs must be unique.');
    }
  }

  initialize(): Promise<void> {
    if (!this.initialization) {
      this.initialization = this.initializeOnce().catch((error) => {
        this.initialization = null;
        throw error;
      });
    }
    return this.initialization;
  }

  async connection(): Promise<SQLite.SQLiteDatabase> {
    await this.initialize();
    if (!this.db) throw new Error('Database is unavailable after initialization.');
    return this.db;
  }

  async close(): Promise<void> {
    if (this.db) await this.db.closeAsync();
    this.db = null;
    this.initialization = null;
  }

  private async initializeOnce(): Promise<void> {
    this.db = await SQLite.openDatabaseAsync(this.databaseName);
    await this.db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `);

    const appliedRows = await this.db.getAllAsync<{ id: string }>('SELECT id FROM schema_migrations');
    const applied = new Set(appliedRows.map((row) => row.id));

    for (const migration of this.migrations) {
      if (applied.has(migration.id)) continue;
      await this.db.withTransactionAsync(async () => {
        await migration.migrate(this.db!);
        await this.db!.runAsync(
          'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)',
          migration.id,
          Date.now()
        );
      });
    }
  }
}
