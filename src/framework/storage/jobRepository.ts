import type { PersistedGenerationJob, PersistedJobStatus } from '../contracts';
import type { IdFactory } from '../ids';
import { AppDatabase } from './database';

interface JobRow {
  id: string;
  owner_id: string;
  idempotency_key: string;
  operation: string;
  status: PersistedJobStatus;
  request_json: string;
  result_json: string | null;
  error_json: string | null;
  remote_job_id: string | null;
  attempts: number;
  next_poll_at: number | null;
  created_at: number;
  updated_at: number;
}

export class JobRepository {
  constructor(private readonly database: AppDatabase, private readonly ids: IdFactory) {}

  async create<TRequest>(input: {
    ownerId: string;
    operation: string;
    request: TRequest;
    idempotencyKey?: string;
  }): Promise<PersistedGenerationJob<TRequest>> {
    const db = await this.database.connection();
    const now = Date.now();
    const job: PersistedGenerationJob<TRequest> = {
      id: this.ids.create(),
      ownerId: input.ownerId,
      idempotencyKey: input.idempotencyKey ?? this.ids.create(),
      operation: input.operation,
      status: 'draft',
      request: input.request,
      result: null,
      error: null,
      remoteJobId: null,
      attempts: 0,
      nextPollAt: null,
      createdAt: now,
      updatedAt: now
    };
    await db.runAsync(
      `INSERT INTO generation_jobs (
        id, owner_id, idempotency_key, operation, status, request_json,
        result_json, error_json, remote_job_id, attempts, next_poll_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0, NULL, ?, ?)`,
      job.id,
      job.ownerId,
      job.idempotencyKey,
      job.operation,
      job.status,
      JSON.stringify(job.request),
      now,
      now
    );
    return job;
  }

  async update<TResult>(
    id: string,
    patch: {
      status: PersistedJobStatus;
      remoteJobId?: string | null;
      result?: TResult | null;
      error?: PersistedGenerationJob['error'];
      nextPollAt?: number | null;
      incrementAttempts?: boolean;
    }
  ): Promise<void> {
    const db = await this.database.connection();
    await db.runAsync(
      `UPDATE generation_jobs SET
        status = ?,
        remote_job_id = COALESCE(?, remote_job_id),
        result_json = ?,
        error_json = ?,
        next_poll_at = ?,
        attempts = attempts + ?,
        updated_at = ?
       WHERE id = ?`,
      patch.status,
      patch.remoteJobId ?? null,
      patch.result === undefined || patch.result === null ? null : JSON.stringify(patch.result),
      patch.error ? JSON.stringify(patch.error) : null,
      patch.nextPollAt ?? null,
      patch.incrementAttempts ? 1 : 0,
      Date.now(),
      id
    );
  }

  async getById<TRequest, TResult>(ownerId: string, id: string): Promise<PersistedGenerationJob<TRequest, TResult> | null> {
    const db = await this.database.connection();
    const row = await db.getFirstAsync<JobRow>(
      'SELECT * FROM generation_jobs WHERE owner_id = ? AND id = ?',
      ownerId,
      id
    );
    return row ? mapJob<TRequest, TResult>(row) : null;
  }

  async listResumable<TRequest, TResult>(ownerId: string): Promise<PersistedGenerationJob<TRequest, TResult>[]> {
    const db = await this.database.connection();
    const rows = await db.getAllAsync<JobRow>(
      `SELECT * FROM generation_jobs
       WHERE owner_id = ? AND status IN ('draft', 'queued', 'running')
       ORDER BY updated_at ASC`,
      ownerId
    );
    return rows.map(mapJob<TRequest, TResult>);
  }
}

function mapJob<TRequest, TResult>(row: JobRow): PersistedGenerationJob<TRequest, TResult> {
  return {
    id: row.id,
    ownerId: row.owner_id,
    idempotencyKey: row.idempotency_key,
    operation: row.operation,
    status: row.status,
    request: JSON.parse(row.request_json),
    result: row.result_json ? JSON.parse(row.result_json) : null,
    error: row.error_json ? JSON.parse(row.error_json) : null,
    remoteJobId: row.remote_job_id,
    attempts: row.attempts,
    nextPollAt: row.next_poll_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

