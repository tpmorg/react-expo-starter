import type { ErrorReporter, SyncQueueEntry } from '../../contracts';
import { retryDelay, SyncWorker, type SyncQueuePort, type SyncTransport } from '../syncWorker';

const entry: SyncQueueEntry = {
  id: 'queue-1',
  ownerId: 'user-1',
  entityType: 'reading',
  entityId: 'reading-1',
  operation: 'upsert',
  payload: {},
  attempts: 0,
  nextAttemptAt: null,
  createdAt: 1,
  updatedAt: 1
};

describe('SyncWorker', () => {
  it('completes successful entries and schedules failures', async () => {
    const completed: string[] = [];
    const failed: Array<[string, number]> = [];
    const queue: SyncQueuePort = {
      listReady: async <TPayload,>() => [
        entry as SyncQueueEntry<TPayload>,
        { ...entry, id: 'queue-2' } as SyncQueueEntry<TPayload>
      ],
      markComplete: async (id) => { completed.push(id); },
      markFailed: async (id, delay) => { failed.push([id, delay]); }
    };
    const transport: SyncTransport = {
      apply: async (item) => {
        if (item.id === 'queue-2') throw new Error('offline');
      }
    };
    const reporter: ErrorReporter = {
      captureException: () => undefined,
      addBreadcrumb: () => undefined,
      setUser: () => undefined
    };

    await expect(new SyncWorker(queue, transport, reporter).run('user-1')).resolves.toEqual({
      completed: 1,
      failed: 1
    });
    expect(completed).toEqual(['queue-1']);
    expect(failed).toEqual([['queue-2', 5000]]);
  });

  it('bounds exponential retry delay', () => {
    expect(retryDelay(1)).toBe(5000);
    expect(retryDelay(99)).toBeLessThanOrEqual(15 * 60_000);
  });
});
