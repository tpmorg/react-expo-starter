import type { DatabaseMigration } from './database';
/** Optional module migration; core-001 is intentionally unchanged. */
export const operationMigrations: readonly DatabaseMigration[] = [{
  id: 'operations-001-outbox',
  async migrate(db) {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS pending_operations (
      id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, operation_key TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL,
      UNIQUE(owner_id, operation_key)
    ); CREATE INDEX IF NOT EXISTS idx_operations_owner ON pending_operations(owner_id, created_at);`);
  }
}];
