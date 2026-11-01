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
  it('keeps work queued if the active account changes during upload', async () => {
    let active = true;
    const markComplete = jest.fn(), markFailed = jest.fn(), merge = jest.fn();
    const worker = new SyncWorker({ listReady: async <T,>() => [entry as SyncQueueEntry<T>], markComplete, markFailed }, {
      apply: async () => { active = false; return { status: 'completed', merge }; }
    }, { captureException() {}, addBreadcrumb() {}, setUser() {} }, { isOwnerActive: () => active });
    await expect(worker.run('user-1')).resolves.toEqual({ completed: 0, failed: 0 });
    expect(markComplete).not.toHaveBeenCalled(); expect(markFailed).not.toHaveBeenCalled(); expect(merge).not.toHaveBeenCalled();
  });
  it('shares runs for an owner and defers offline work without a failure penalty', async () => {
    const markComplete = jest.fn(), markFailed = jest.fn();
    const queue: SyncQueuePort = { listReady: async <T,>() => [entry as SyncQueueEntry<T>], markComplete, markFailed };
    const apply = jest.fn(async () => ({ status: 'deferred' as const }));
    const worker = new SyncWorker(queue, { apply }, { captureException() {}, addBreadcrumb() {}, setUser() {} });
    const first = worker.run('user-1'); expect(worker.run('user-1')).toBe(first);
    await first; expect(markComplete).not.toHaveBeenCalled(); expect(markFailed).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledTimes(1);
  });
  it('acknowledges batch successes before merging and leaves missing results queued', async () => {
    const order: string[] = [];
    const queue: SyncQueuePort = {
      listReady: async <T,>() => [entry as SyncQueueEntry<T>, { ...entry, id: 'other' } as SyncQueueEntry<T>],
      markComplete: async id => { order.push(id); }, markFailed: jest.fn()
    };
    const worker = new SyncWorker(queue, { applyBatch: async () => [
      { id: entry.id, status: 'completed', merge: async () => { order.push('merge'); } }
    ] }, { captureException() {}, addBreadcrumb() {}, setUser() {} });
    await expect(worker.run('user-1')).resolves.toEqual({ completed: 1, failed: 0 });
    expect(order).toEqual([entry.id, 'merge']); expect(queue.markFailed).not.toHaveBeenCalled();
  });
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
