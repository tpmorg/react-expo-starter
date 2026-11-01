import type { AuthTokenProvider, GenerationJob } from '../contracts';
import { ApiClient, ApiRequestError } from './apiClient';

export class GenerationApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly requestId?: string
  ) {
    super(message);
    this.name = 'GenerationApiError';
  }
}

export class GenerationApiClient<TRequest = unknown, TResult = unknown> {
  private readonly client: ApiClient;
  constructor(
    private readonly baseUrl: string,
    private readonly tokens: AuthTokenProvider,
    private readonly jobsPath = '/api/v1/jobs'
  ) { this.client = new ApiClient(baseUrl, tokens); }

  async createJob(
    imageUri: string,
    request: TRequest,
    idempotencyKey: string
  ): Promise<GenerationJob<TResult>> {
    const form = new FormData();
    form.append('image', {
      uri: imageUri,
      name: 'source.jpg',
      type: 'image/jpeg'
    } as unknown as Blob);
    form.append('request', JSON.stringify(request));

    return this.requestWithThrottleRetry(this.jobsPath, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: form
    });
  }

  private async requestWithThrottleRetry<T>(
    path: string,
    init: RequestInit,
    maxAttempts = 4
  ): Promise<T> {
    const owner = this.tokens.getOwnerId?.();
    const revision = this.tokens.getSessionRevision?.();
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (owner !== this.tokens.getOwnerId?.() || revision !== this.tokens.getSessionRevision?.()) {
        throw new GenerationApiError('The active account changed.', 'ACCOUNT_CHANGED', 0, false);
      }
      try {
        return await this.request<T>(path, init);
      } catch (error) {
        lastError = error;
        const retryableThrottle =
          error instanceof GenerationApiError &&
          error.status === 429 &&
          error.retryable &&
          (error.code === 'RATE_LIMITED' || error.code === 'THROTTLED');
        if (!retryableThrottle || attempt === maxAttempts) throw error;
        await pause(2 ** (attempt - 1) * 1000, init.signal ?? undefined);
      }
    }
    throw lastError;
  }

  async waitForJob(
    initial: GenerationJob<TResult>,
    options: { timeoutMs?: number; signal?: AbortSignal } = {}
  ): Promise<TResult> {
    const timeoutMs = options.timeoutMs ?? 180_000;
    const deadline = Date.now() + timeoutMs;
    const owner = this.tokens.getOwnerId?.();
    const revision = this.tokens.getSessionRevision?.();
    const assertIdentity = () => {
      if (owner !== this.tokens.getOwnerId?.() || revision !== this.tokens.getSessionRevision?.()) {
        throw new GenerationApiError('The active account changed.', 'ACCOUNT_CHANGED', 0, false);
      }
    };
    let job = initial;

    while (job.status === 'queued' || job.status === 'running') {
      if (Date.now() >= deadline) {
        throw new GenerationApiError(
          'Polling timed out. The remote job may still be running.',
          'JOB_TIMEOUT',
          408,
          true
        );
      }
      await pause(job.pollAfterMs ?? 1500, options.signal);
      assertIdentity();
      job = await this.request(`${this.jobsPath}/${encodeURIComponent(job.id)}`, {
        method: 'GET',
        signal: options.signal
      });
    }

    assertIdentity();
    if (job.status === 'succeeded' && job.result !== undefined) return job.result;
    throw new GenerationApiError(
      'The generation did not complete.',
      job.error?.code ?? 'JOB_FAILED',
      400,
      job.error?.retryable ?? false,
      job.error?.requestId
    );
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    try {
      return await this.client.request<T>(path, {
        method: init.method, headers: init.headers, rawBody: init.body ?? undefined,
        signal: init.signal ?? undefined,
        schema: { parse(value) {
          if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string' || !('status' in value) || !['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(String(value.status))) {
            throw new Error('Invalid job.');
          }
          return value as T;
        } }
      });
    } catch (error) {
      if (error instanceof ApiRequestError) throw new GenerationApiError(error.message,
        error.code === 'NOT_CONFIGURED' ? 'CONFIGURATION' : error.code === 'NETWORK' ? 'NETWORK_ERROR' : error.code,
        error.status, error.retryable, error.requestId);
      throw error;
    }
  }
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      reject(new GenerationApiError('Polling was cancelled.', 'ABORTED', 499, false));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort); resolve();
    }, Math.max(0, Math.min(ms, 5000)));
    signal?.addEventListener('abort', abort, {once:true});
    if(signal?.aborted) abort();
  });
}
