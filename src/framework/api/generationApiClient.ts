import type { AuthTokenProvider, GenerationJob } from '../contracts';

interface ErrorPayload {
  code?: string;
  message?: string;
  retryable?: boolean;
  requestId?: string;
}

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
  constructor(
    private readonly baseUrl: string,
    private readonly tokens: AuthTokenProvider,
    private readonly jobsPath = '/api/v1/jobs'
  ) {}

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
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
      job = await this.request(`${this.jobsPath}/${encodeURIComponent(job.id)}`, {
        method: 'GET',
        signal: options.signal
      });
    }

    if (job.status === 'succeeded' && job.result) return job.result;
    throw new GenerationApiError(
      job.error?.message ?? 'The generation did not complete.',
      job.error?.code ?? 'JOB_FAILED',
      400,
      job.error?.retryable ?? false,
      job.error?.requestId
    );
  }

  private async request<T>(path: string, init: RequestInit, didRefresh = false): Promise<T> {
    if (!this.baseUrl) throw new GenerationApiError('API URL is not configured.', 'CONFIGURATION', 0, false);
    const token = await this.tokens.getToken(didRefresh);
    if (!token) throw new GenerationApiError('Sign in to use the API.', 'UNAUTHENTICATED', 401, false);
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set('Accept', 'application/json');

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        ...init,
        headers
      });
    } catch (error) {
      throw new GenerationApiError(
        error instanceof Error ? error.message : 'Network request failed.',
        'NETWORK_ERROR',
        0,
        true
      );
    }

    if (response.status === 401 && !didRefresh) {
      return this.request(path, init, true);
    }

    const payload = await readJson<T | ErrorPayload>(response);
    if (!response.ok) {
      const error = payload as ErrorPayload;
      throw new GenerationApiError(
        error.message ?? 'The service could not complete this request.',
        error.code ?? `HTTP_${response.status}`,
        response.status,
        error.retryable ?? response.status >= 500,
        error.requestId ?? response.headers.get('x-request-id') ?? undefined
      );
    }
    return payload as T;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new GenerationApiError('The service returned an invalid response.', 'INVALID_RESPONSE', 502, true);
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
