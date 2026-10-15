import type { ErrorReporter, SyncQueueEntry } from '../contracts';

export interface SyncQueuePort {
  listReady<TPayload>(ownerId: string, limit?: number): Promise<SyncQueueEntry<TPayload>[]>;
  markComplete(id: string): Promise<void>;
  markFailed(id: string, delayMs: number): Promise<void>;
}

export interface SyncTransport {
  apply(entry: SyncQueueEntry): Promise<void>;
}

export interface SyncRunResult {
  completed: number;
  failed: number;
}

export class SyncWorker {
  constructor(
    private readonly queue: SyncQueuePort,
    private readonly transport: SyncTransport,
    private readonly reporter: ErrorReporter
  ) {}

  async run(ownerId: string, limit = 25): Promise<SyncRunResult> {
    const entries = await this.queue.listReady(ownerId, limit);
    let completed = 0;
    let failed = 0;

    for (const entry of entries) {
      try {
        await this.transport.apply(entry);
        await this.queue.markComplete(entry.id);
        completed += 1;
      } catch (error) {
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

