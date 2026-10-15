import type { BillingState } from '../contracts';
import { AppDatabase } from './database';

export class BillingCacheRepository {
  constructor(private readonly database: AppDatabase) {}

  async save(ownerId: string, state: BillingState): Promise<void> {
    const db = await this.database.connection();
    await db.runAsync(
      `INSERT INTO billing_snapshots (owner_id, state_json, checked_at)
       VALUES (?, ?, ?)
       ON CONFLICT(owner_id) DO UPDATE SET
         state_json = excluded.state_json,
         checked_at = excluded.checked_at`,
      ownerId,
      JSON.stringify(state),
      state.checkedAt
    );
  }

  async get(ownerId: string): Promise<BillingState | null> {
    const db = await this.database.connection();
    const row = await db.getFirstAsync<{ state_json: string }>(
      'SELECT state_json FROM billing_snapshots WHERE owner_id = ?',
      ownerId
    );
    return row ? JSON.parse(row.state_json) : null;
  }

  async clear(ownerId: string): Promise<void> {
    const db = await this.database.connection();
    await db.runAsync('DELETE FROM billing_snapshots WHERE owner_id = ?', ownerId);
  }
}

