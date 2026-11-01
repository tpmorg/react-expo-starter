import type { AuthTokenProvider } from '../contracts';
import { scrubDeep } from '../observability/scrub';

export type AuthMode = 'required' | 'optional' | 'none';
export interface ResponseSchema<T> { parse(value: unknown): T }
export class ApiRequestError extends Error {
  constructor(message: string, readonly code: string, readonly status: number,
    readonly retryable: boolean, readonly requestId?: string, readonly details?: unknown) {
    super(message); this.name = 'ApiRequestError';
  }
}
export interface ApiRequestOptions<T> {
  method?: string;
  body?: unknown;
  /** For multipart clients. Do not set Content-Type; fetch adds the boundary. */
  rawBody?: BodyInit;
  auth?: AuthMode;
  schema?: ResponseSchema<T>;
  headers?: HeadersInit;
  signal?: AbortSignal;
  allowNotModified?: boolean;
  timeoutMs?: number;
}
export interface ApiClientOptions { fetch?: typeof fetch; timeoutMs?: number }

/** No automatic retries of mutations. The caller supplies durable idempotency where needed. */
export class ApiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  constructor(baseUrl: string, private readonly tokens: AuthTokenProvider, private readonly options: ApiClientOptions = {}) {
    this.baseUrl = baseUrl.trim().replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? ((...args) => fetch(...args));
  }
  get isConfigured(): boolean { return Boolean(this.baseUrl); }

  request<T>(path: string, options: ApiRequestOptions<T> & { allowNotModified: true }): Promise<T | null>;
  request<T = void>(path: string, options?: ApiRequestOptions<T>): Promise<T>;
  async request<T>(path: string, options: ApiRequestOptions<T> = {}): Promise<T | null> {
    if (!this.isConfigured) throw new ApiRequestError('API is not configured.', 'NOT_CONFIGURED', 0, false);
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
      throw new ApiRequestError('API path must be relative to its base URL.', 'INVALID_PATH', 0, false);
    }
    const auth = options.auth ?? 'required';
    const owner = this.tokens.getOwnerId?.();
    const revision = this.tokens.getSessionRevision?.();
    const assertIdentity = () => {
      if (auth !== 'none' && (owner !== this.tokens.getOwnerId?.() || revision !== this.tokens.getSessionRevision?.())) {
        throw new ApiRequestError('The active account changed.', 'ACCOUNT_CHANGED', 0, false);
      }
    };
    const controller = new AbortController();
    let timedOut = false;
    let rejectAbort!: (error: ApiRequestError) => void;
    const abortPromise = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const abort = () => {
      controller.abort();
      rejectAbort(new ApiRequestError(timedOut ? 'The request timed out.' : 'The request was cancelled.', timedOut ? 'TIMEOUT' : 'ABORTED', 0, timedOut));
    };
    const timer = setTimeout(() => { timedOut = true; abort(); }, options.timeoutMs ?? this.options.timeoutMs ?? 15_000);
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    try {
      return await Promise.race([abortPromise, (async () => {
        const send = async (refresh: boolean) => {
          assertIdentity();
          if (controller.signal.aborted) throw new ApiRequestError('The request was cancelled.', 'ABORTED', 0, false);
          const headers = new Headers(options.headers);
          headers.delete('Authorization');
          if (auth !== 'none') {
            const token = this.tokens.getOwnerId && owner === null ? null : await this.tokens.getToken(refresh);
            assertIdentity();
            if (token) headers.set('Authorization', `Bearer ${token}`);
            else if (auth === 'required') throw new ApiRequestError('No signed-in session.', 'UNAUTHENTICATED', 401, false);
          }
          headers.set('Accept', 'application/json');
          if (options.body !== undefined) headers.set('Content-Type', 'application/json');
          if (controller.signal.aborted) throw new ApiRequestError('The request was cancelled.', 'ABORTED', 0, false);
          try {
            return await this.fetchImpl(`${this.baseUrl}${path}`, {
              method: options.method ?? 'GET', headers,
              body: options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
              signal: controller.signal
            });
          } catch {
            throw new ApiRequestError('The network request failed.', 'NETWORK', 0, true);
          }
        };
        let response = await send(false);
        assertIdentity();
        if (response.status === 401 && auth !== 'none') response = await send(true);
        assertIdentity();
        const requestId = response.headers.get('x-request-id') ?? undefined;
        if (response.status === 304 && options.allowNotModified) return null;
        let data: unknown;
        if (response.status !== 204) {
          try { data = await response.json(); }
          catch {
            if (response.ok) throw new ApiRequestError('The response is unreadable.', 'INVALID_RESPONSE', response.status, false, requestId);
          }
        }
        assertIdentity();
        if (!response.ok) {
          const envelope = data && typeof data === 'object' ? data as Record<string, unknown> : {};
          const payload = (envelope.error && typeof envelope.error === 'object' ? envelope.error : envelope) as Record<string, unknown>;
          const code = typeof payload.code === 'string' && /^[A-Z0-9_/-]{1,80}$/i.test(payload.code) ? payload.code : `HTTP_${response.status}`;
          // Untrusted server messages and bodies never become exception messages.
          throw new ApiRequestError(`Request failed with status ${response.status}.`, code, response.status,
            typeof payload.retryable === 'boolean' ? payload.retryable : response.status === 429 || (response.status >= 500 && response.status !== 501),
            typeof payload.requestId === 'string' ? payload.requestId : requestId, scrubDeep(payload.details));
        }
        if (!options.schema) return undefined as T;
        try { return options.schema.parse(data); }
        catch { throw new ApiRequestError('The response did not match its contract.', 'INVALID_RESPONSE', response.status, false, requestId); }
      })()]);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }
}
