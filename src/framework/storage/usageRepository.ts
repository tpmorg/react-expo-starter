import type { UsageEvent } from '../contracts';
import type { IdFactory } from '../ids';
import { AppDatabase } from './database';

export class UsageRepository {
  constructor(private readonly database: AppDatabase, private readonly ids: IdFactory) {}

  async record(input: Omit<UsageEvent, 'id' | 'createdAt'> & { createdAt?: number }): Promise<UsageEvent> {
    const db = await this.database.connection();
    const event: UsageEvent = {
      ...input,
      id: this.ids.create(),
      createdAt: input.createdAt ?? Date.now()
    };
    await db.runAsync(
      `INSERT INTO usage_events (
        id, owner_id, job_id, event_type, source, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      event.id,
      event.ownerId,
      event.jobId,
      event.eventType,
      event.source,
      event.metadata ? JSON.stringify(event.metadata) : null,
      event.createdAt
    );
    return event;
  }

  async count(ownerId: string, eventType: UsageEvent['eventType'] = 'completed'): Promise<number> {
    const db = await this.database.connection();
    const row = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM usage_events WHERE owner_id = ? AND event_type = ?',
      ownerId,
      eventType
    );
    return row?.count ?? 0;
  }
}

