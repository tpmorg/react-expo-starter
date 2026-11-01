import type { ErrorReporter, SyncQueueEntry } from '../contracts';

export interface SyncQueuePort {
  listReady<TPayload>(ownerId: string, limit?: number): Promise<SyncQueueEntry<TPayload>[]>;
  markComplete(id: string): Promise<void>;
  markFailed(id: string, delayMs: number): Promise<void>;
}

export interface SyncTransport {
  apply?(entry: SyncQueueEntry): Promise<void | SyncApplyResult>;
  applyBatch?(entries: readonly SyncQueueEntry[]): Promise<readonly SyncBatchResult[]>;
}
export type SyncApplyResult = { status: 'completed'; merge?: () => Promise<void> }
  | { status: 'deferred' } | { status: 'failed'; error?: unknown };
export type SyncBatchResult = SyncApplyResult & { id: string };

export interface SyncRunResult {
  completed: number;
  failed: number;
}

export class SyncWorker {
  private readonly runs = new Map<string, Promise<SyncRunResult>>();
  constructor(
    private readonly queue: SyncQueuePort,
    private readonly transport: SyncTransport,
    private readonly reporter: ErrorReporter,
    private readonly options: { isOwnerActive?: (ownerId: string) => boolean } = {}
  ) {}

  run(ownerId: string, limit = 25): Promise<SyncRunResult> {
    const active = this.runs.get(ownerId);
    if (active) return active;
    const run = this.runOnce(ownerId, limit).finally(() => this.runs.delete(ownerId));
    this.runs.set(ownerId, run);
    return run;
  }

  private async runOnce(ownerId: string, limit: number): Promise<SyncRunResult> {
    const entries = await this.queue.listReady(ownerId, limit);
    let completed = 0;
    let failed = 0;
    const active = () => this.options.isOwnerActive?.(ownerId) ?? true;
    if (!active()) return { completed, failed };

    let batch: readonly SyncBatchResult[] | null = null;
    if (this.transport.applyBatch && entries.length) {
      try { batch = await this.transport.applyBatch(entries); }
      catch (error) { batch = entries.map(entry => ({ id: entry.id, status: 'failed' as const, error })); }
    }

    for (const entry of entries) {
      if (!active()) break;
      try {
        const result = batch
          ? batch.find(item => item.id === entry.id) ?? { status: 'deferred' as const }
          : this.transport.apply ? await this.transport.apply(entry) : { status: 'deferred' as const };
        if (!active()) break;
        if (result?.status === 'deferred') { if (batch) continue; break; }
        if (result?.status === 'failed') throw result.error ?? new Error('Sync failed.');
        await this.queue.markComplete(entry.id);
        completed += 1;
        // A response merge must not clear a newer edit queued during this upload.
        if (active() && result?.status === 'completed' && result.merge) {
          try { await result.merge(); }
          catch (error) { this.reporter.captureException(error, { operation: 'sync.merge' }); }
        }
      } catch (error) {
        if (!active()) break;
        failed += 1;
        const delayMs = retryDelay(entry.attempts + 1);
        await this.queue.markFailed(entry.id, delayMs);
        this.reporter.captureException(error, {
          operation: 'sync.apply',
          entityType: entry.entityType,
          operationType: entry.operation,
          attempts: entry.attempts + 1
        });
      }
    }

    return { completed, failed };
  }
}

export function retryDelay(attempt: number): number {
  const boundedAttempt = Math.max(1, Math.min(attempt, 8));
  return Math.min(15 * 60_000, 2 ** (boundedAttempt - 1) * 5_000);
}

