import type { SqlDatabaseProvider } from '../storage/ports';
import type { IdFactory } from '../ids';
export interface PendingOperation<T> { id: string; ownerId: string; key: string; idempotencyKey: string; payload: T; createdAt: number }
export class PendingOperationStore<T> {
  private readonly running = new Map<string, Promise<OperationResult<unknown>>>();
  constructor(private readonly database: SqlDatabaseProvider, private readonly ids: IdFactory) {}
  async create(ownerId: string, key: string, payload: T): Promise<PendingOperation<T>> {
    const db = await this.database.connection();
    await db.runAsync(`INSERT OR IGNORE INTO pending_operations (id, owner_id, operation_key, idempotency_key, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      this.ids.create(), ownerId, key, this.ids.create(), JSON.stringify(payload), Date.now());
    return (await this.list(ownerId)).find(op => op.key === key)!;
  }
  async list(ownerId: string): Promise<PendingOperation<T>[]> {
    const db = await this.database.connection();
    const rows = await db.getAllAsync<{ id: string; owner_id: string; operation_key: string; idempotency_key: string; payload_json: string; created_at: number }>(
      'SELECT * FROM pending_operations WHERE owner_id = ? ORDER BY created_at', ownerId);
    return rows.map(row => ({ id: row.id, ownerId: row.owner_id, key: row.operation_key, idempotencyKey: row.idempotency_key, payload: JSON.parse(row.payload_json) as T, createdAt: row.created_at }));
  }
  async remove(op: PendingOperation<T>) {
    const db = await this.database.connection();
    await db.runAsync('DELETE FROM pending_operations WHERE owner_id = ? AND id = ?', op.ownerId, op.id);
  }
  /** Pending financial work is not rekeyed to a different account. Resolve it under its original owner. */
  async purgeOwner(ownerId: string) { const db = await this.database.connection(); await db.runAsync('DELETE FROM pending_operations WHERE owner_id = ?', ownerId); }
  run<R>(op: PendingOperation<T>, send: (op: PendingOperation<T>) => Promise<R>, options: IdempotentOptions = {}): Promise<OperationResult<R>> {
    const active = this.running.get(op.id);
    if (active) return active as Promise<OperationResult<R>>;
    const pending = runIdempotent(op, send, { ...options, complete: () => this.remove(op) }).finally(() => this.running.delete(op.id));
    this.running.set(op.id, pending);
    return pending;
  }
  async resume<R>(ownerId: string, send: (op: PendingOperation<T>) => Promise<R>, options: IdempotentOptions = {}) {
    const results: OperationResult<R>[] = [];
    for (const op of await this.list(ownerId)) results.push(await this.run(op, send, options));
    return results;
  }
}
export type OperationResult<R> = { status: 'done'; value: R } | { status: 'pending' | 'failed'; error: unknown };
export interface IdempotentOptions {
  delays?: readonly number[];
  /** Must explicitly classify definitive failures. Unknown errors retain durable work. */
  isTerminal?: (error: unknown) => boolean;
  isOwnerActive?: (ownerId: string) => boolean;
}
export async function runIdempotent<T, R>(op: PendingOperation<T>, send: (op: PendingOperation<T>) => Promise<R>,
  options: IdempotentOptions & { complete(): Promise<void> }): Promise<OperationResult<R>> {
  const delays = options.delays ?? [];
  for (let attempt = 0; ; attempt++) {
    if (options.isOwnerActive && !options.isOwnerActive(op.ownerId)) return { status: 'pending', error: new Error('Operation owner is inactive.') };
    try {
      const value = await send(op);
      await options.complete();
      return { status: 'done', value };
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      const uncertain = ['NETWORK', 'NETWORK_ERROR', 'TIMEOUT', 'ABORTED', 'INVALID_RESPONSE', 'ACCOUNT_CHANGED', 'UNAUTHENTICATED'].includes(code);
      if (!uncertain && options.isTerminal?.(error)) { await options.complete(); return { status: 'failed', error }; }
      if (attempt >= delays.length) return { status: 'pending', error };
      await new Promise(resolve => setTimeout(resolve, Math.min(30_000, Math.max(0, delays[attempt] ?? 0))));
    }
  }
}
