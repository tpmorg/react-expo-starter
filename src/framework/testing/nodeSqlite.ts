// Node-only test entry point. Never import this module into the mobile bundle.
import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { SqlDatabase, SqlParam } from '../storage/ports';

export function openMemoryDatabase() {
  const raw = new DatabaseSync(':memory:');
  const scope = new AsyncLocalStorage<boolean>();
  let tail: Promise<unknown> = Promise.resolve();
  const db: SqlDatabase & { closeAsync(): Promise<void> } = {
    execAsync: async sql => { raw.exec(sql); },
    getAllAsync: async <T>(sql: string, ...params: SqlParam[]) => raw.prepare(sql).all(...params) as T[],
    getFirstAsync: async <T>(sql: string, ...params: SqlParam[]) => (raw.prepare(sql).get(...params) ?? null) as T | null,
    runAsync: async (sql, ...params) => {
      const r = raw.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    withTransactionAsync: task => {
      if (scope.getStore()) return task();
      const run = tail.then(() => scope.run(true, async () => {
        raw.exec('BEGIN');
        try { await task(); raw.exec('COMMIT'); }
        catch (error) { raw.exec('ROLLBACK'); throw error; }
      }));
      tail = run.catch(() => undefined);
      return run;
    },
    closeAsync: async () => { await tail; raw.close(); }
  };
  return { db, raw, connection: async () => db };
}
