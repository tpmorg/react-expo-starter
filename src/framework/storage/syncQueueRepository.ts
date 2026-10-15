import type { SyncQueueEntry } from '../contracts';
import type { IdFactory } from '../ids';
import { AppDatabase } from './database';

interface QueueRow {
  id: string;
  owner_id: string;
  entity_type: string;
  entity_id: string;
  operation: SyncQueueEntry['operation'];
  payload_json: string | null;
  attempts: number;
  next_attempt_at: number | null;
  created_at: number;
  updated_at: number;
}

export class SyncQueueRepository {
  constructor(private readonly database: AppDatabase, private readonly ids: IdFactory) {}

  async enqueue<TPayload>(input: Omit<SyncQueueEntry<TPayload>, 'id' | 'attempts' | 'createdAt' | 'updatedAt'>): Promise<void> {
    const db = await this.database.connection();
    const now = Date.now();
    await db.runAsync(
      `INSERT INTO sync_queue (
        id, owner_id, entity_type, entity_id, operation, payload_json,
        attempts, next_attempt_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      ON CONFLICT(owner_id, entity_type, entity_id, operation) DO UPDATE SET
        id = excluded.id,
        payload_json = excluded.payload_json,
        attempts = 0,
        next_attempt_at = excluded.next_attempt_at,
        updated_at = excluded.updated_at`,
      this.ids.create(),
      input.ownerId,
      input.entityType,
      input.entityId,
      input.operation,
      input.payload === null ? null : JSON.stringify(input.payload),
      input.nextAttemptAt,
      now,
      now
    );
  }

  async listReady<TPayload>(ownerId: string, limit = 25): Promise<SyncQueueEntry<TPayload>[]> {
    const db = await this.database.connection();
    const rows = await db.getAllAsync<QueueRow>(
      `SELECT * FROM sync_queue
       WHERE owner_id = ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
       ORDER BY created_at ASC LIMIT ?`,
      ownerId,
      Date.now(),
      limit
    );
    return rows.map((row) => ({
      id: row.id,
      ownerId: row.owner_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      operation: row.operation,
      payload: row.payload_json ? JSON.parse(row.payload_json) : null,
      attempts: row.attempts,
      nextAttemptAt: row.next_attempt_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  async markComplete(id: string): Promise<void> {
    const db = await this.database.connection();
    await db.runAsync('DELETE FROM sync_queue WHERE id = ?', id);
  }

  async markFailed(id: string, delayMs: number): Promise<void> {
    const db = await this.database.connection();
    const now = Date.now();
    await db.runAsync(
      `UPDATE sync_queue SET attempts = attempts + 1, next_attempt_at = ?, updated_at = ? WHERE id = ?`,
      now + Math.max(1000, delayMs),
      now,
      id
    );
  }
}
