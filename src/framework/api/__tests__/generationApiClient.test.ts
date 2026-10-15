import type { AuthTokenProvider } from '../../contracts';
import { GenerationApiClient } from '../generationApiClient';

const request = { instruction: 'Example transformation' };

function response(status: number, payload: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(payload),
    headers: { get: () => null }
  } as unknown as Response;
}

describe('GenerationApiClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('refreshes the auth token once after a 401 and preserves the idempotency key', async () => {
    const refreshCalls: boolean[] = [];
    const tokens: AuthTokenProvider = {
      getToken: async (forceRefresh = false) => {
        refreshCalls.push(forceRefresh);
        return forceRefresh ? 'fresh-token' : 'stale-token';
      }
    };
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(response(401, { code: 'TOKEN_EXPIRED' }))
      .mockResolvedValueOnce(response(202, { id: 'job-1', status: 'queued' }));

    await expect(
      new GenerationApiClient('https://api.example.com', tokens)
        .createJob('file:///source.jpg', request, 'stable-key')
    ).resolves.toMatchObject({ id: 'job-1', status: 'queued' });

    expect(refreshCalls).toEqual([false, true]);
    const firstHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    const secondHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(firstHeaders.get('Idempotency-Key')).toBe('stable-key');
    expect(secondHeaders.get('Idempotency-Key')).toBe('stable-key');
    expect(secondHeaders.get('Authorization')).toBe('Bearer fresh-token');
  });
});
