export interface KeyValuePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export type SqlParam = string | number | null | Uint8Array;
export interface SqlDatabase {
  execAsync(sql: string): Promise<void>;
  getAllAsync<T>(sql: string, ...params: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: SqlParam[]): Promise<T | null>;
  runAsync(sql: string, ...params: SqlParam[]): Promise<{ changes: number; lastInsertRowId: number }>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
export interface SqlDatabaseProvider { connection(): Promise<SqlDatabase> }
