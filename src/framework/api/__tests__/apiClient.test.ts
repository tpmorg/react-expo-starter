import { ApiClient, ApiRequestError } from '../apiClient';
const schema = { parse(v: unknown) { if (!v || typeof v !== 'object' || !('ok' in v)) throw new Error('secret body'); return v as { ok: boolean }; } };
const response = (status: number, value?: unknown) => ({ status, ok: status >= 200 && status < 300, headers: new Headers(), json: async () => value } as Response);
test('required, optional and unauthenticated requests; schema and conditional GET', async () => {
  const fetch = jest.fn(async () => response(200, { ok: true }));
  const getToken = jest.fn(async () => null);
  const api = new ApiClient('https://api.test', { getToken }, { fetch });
  await expect(api.request('/test', { schema })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  await api.request('/test', { auth: 'none', schema });
  await api.request('/test', { auth: 'optional', schema });
  expect(fetch).toHaveBeenCalledTimes(2);
  fetch.mockResolvedValueOnce(response(304));
  await expect(api.request('/test', { auth: 'none', schema, allowNotModified: true })).resolves.toBeNull();
  fetch.mockResolvedValueOnce(response(200, 'secret body'));
  await expect(api.request('/test', { auth: 'none', schema })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
test('refreshes once with the same idempotency key and rejects account switch before replay', async () => {
  let owner = 'a';
  const getToken = jest.fn(async () => 'token');
  const fetch = jest.fn<ReturnType<typeof global.fetch>, Parameters<typeof global.fetch>>(async () => response(401));
  const api = new ApiClient('https://api.test', { getToken, getOwnerId: () => owner }, { fetch });
  await expect(api.request('/x', { method: 'POST', headers: { 'Idempotency-Key': 'stable' } })).rejects.toMatchObject({ status: 401 });
  expect(getToken.mock.calls).toEqual([[false], [true]]);
  expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Idempotency-Key')).toBe('stable');
  fetch.mockImplementationOnce(async () => { owner = 'b'; return response(401); });
  await expect(api.request('/x')).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
  expect(fetch).toHaveBeenCalledTimes(3);
});
test('timeout covers slow response bodies; pre-aborted calls never send', async () => {
  const fetch = jest.fn(async () => ({ ...response(200), json: () => new Promise(() => {}) } as Response));
  const api = new ApiClient('https://api.test', { getToken: async () => 'token' }, { fetch, timeoutMs: 5 });
  await expect(api.request('/x', { schema })).rejects.toMatchObject({ code: 'TIMEOUT' });
  const controller = new AbortController(); controller.abort();
  await expect(api.request('/x', { signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' });
  expect(fetch).toHaveBeenCalledTimes(1);
});
test('session revision rejects switching away and back even when the uid is unchanged', async () => {
  let revision = 1;
  const api = new ApiClient('https://api.test', {
    getToken: async () => 'token', getOwnerId: () => 'a', getSessionRevision: () => revision
  }, { fetch: async () => { revision += 2; return response(200, { ok: true }); } });
  await expect(api.request('/x', { schema })).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
});
test('redacts error details, hides untrusted server messages, and treats 501 as terminal', async () => {
  const api = new ApiClient('https://api.test', { getToken: async () => 'token' }, { fetch: async () => response(501, { error: { message: 'Bearer secret', details: { authorization: 'private' } } }) });
  try { await api.request('/x'); throw new Error('expected failure'); }
  catch (e) {
    expect(e).toBeInstanceOf(ApiRequestError);
    expect(e).toMatchObject({ retryable: false, details: { authorization: '[redacted]' } });
    expect((e as Error).message).not.toContain('secret');
  }
});
