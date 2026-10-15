import type { DatabaseMigration } from './database';
import type { SQLiteDatabase } from 'expo-sqlite';

export const coreMigrations: readonly DatabaseMigration[] = [
  {
    id: 'core-001-infrastructure',
    async migrate(db) {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS generation_jobs (
          id TEXT PRIMARY KEY NOT NULL,
          owner_id TEXT NOT NULL,
          idempotency_key TEXT NOT NULL UNIQUE,
          operation TEXT NOT NULL,
          status TEXT NOT NULL,
          request_json TEXT NOT NULL,
          result_json TEXT,
          error_json TEXT,
          remote_job_id TEXT,
          attempts INTEGER NOT NULL DEFAULT 0,
          next_poll_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS usage_events (
          id TEXT PRIMARY KEY NOT NULL,
          owner_id TEXT NOT NULL,
          job_id TEXT,
          event_type TEXT NOT NULL,
          source TEXT NOT NULL,
          metadata_json TEXT,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS billing_snapshots (
          owner_id TEXT PRIMARY KEY NOT NULL,
          state_json TEXT NOT NULL,
          checked_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sync_queue (
          id TEXT PRIMARY KEY NOT NULL,
          owner_id TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          payload_json TEXT,
          attempts INTEGER NOT NULL DEFAULT 0,
          next_attempt_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(owner_id, entity_type, entity_id, operation)
        );

        CREATE INDEX IF NOT EXISTS idx_jobs_owner_updated
          ON generation_jobs(owner_id, updated_at DESC);

        CREATE INDEX IF NOT EXISTS idx_usage_owner_created
          ON usage_events(owner_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_sync_queue_ready
          ON sync_queue(owner_id, next_attempt_at);
      `);
      await ensureColumn(db, 'generation_jobs', 'operation', "TEXT NOT NULL DEFAULT 'generation'");
      await ensureColumn(db, 'generation_jobs', 'remote_job_id', 'TEXT');
      await ensureColumn(db, 'generation_jobs', 'attempts', 'INTEGER NOT NULL DEFAULT 0');
      await ensureColumn(db, 'generation_jobs', 'next_poll_at', 'INTEGER');
      await ensureColumn(db, 'usage_events', 'metadata_json', 'TEXT');
      await ensureColumn(db, 'sync_queue', 'updated_at', 'INTEGER NOT NULL DEFAULT 0');
      // Rebuild only the queue structure to replace the old cross-owner unique key.
      await db.execAsync(`
        CREATE TABLE sync_queue_upgrade (
          id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL,
          entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, operation TEXT NOT NULL,
          payload_json TEXT, attempts INTEGER NOT NULL DEFAULT 0,
          next_attempt_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
          UNIQUE(owner_id, entity_type, entity_id, operation)
        );
        INSERT INTO sync_queue_upgrade SELECT id, owner_id, entity_type, entity_id,
          operation, payload_json, attempts, next_attempt_at, created_at, updated_at FROM sync_queue;
        DROP TABLE sync_queue;
        ALTER TABLE sync_queue_upgrade RENAME TO sync_queue;
        CREATE INDEX idx_sync_queue_ready ON sync_queue(owner_id, next_attempt_at);
        CREATE INDEX IF NOT EXISTS idx_jobs_resume ON generation_jobs(owner_id, status, next_poll_at);
      `);
    }
  }
];

async function ensureColumn(
  db: SQLiteDatabase,
  table: string,
  column: string,
  definition: string
): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
