import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createApi, retryDelay, shouldRetryQuery } from './index';

/** Remplace `fetch` pour un test ; rend la fonction espionne pour lire les appels. */
function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal('fetch', spy);
  return spy;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createApi', () => {
  it('envoie le JSON avec le cookie et les en-têtes de l’application, rend le corps', async () => {
    const spy = stubFetch(async () => json(200, { ok: 1 }));
    const onRequest = vi.fn();
    const api = createApi({ headers: () => ({ 'x-dex-profile': 'p2' }), onRequest });
    await expect(api('/api/x', { method: 'POST', json: { a: 1 } })).resolves.toEqual({ ok: 1 });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/x');
    expect(init.credentials).toBe('include');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toEqual({ 'content-type': 'application/json', 'x-dex-profile': 'p2' });
    expect(onRequest).toHaveBeenCalledWith('/api/x');
  });

  it('204 : rien à lire', async () => {
    stubFetch(async () => new Response(null, { status: 204 }));
    await expect(createApi()('/api/x')).resolves.toBeUndefined();
  });

  it('refus : ApiError avec le code du serveur, ou HTTP_<statut>, et Retry-After', async () => {
    stubFetch(async () => json(409, { error: 'NOT_ENOUGH_MONEY' }));
    await expect(createApi()('/api/x')).rejects.toMatchObject({
      status: 409,
      code: 'NOT_ENOUGH_MONEY',
    });
    stubFetch(async () => json(429, null, { 'retry-after': '3' }));
    await expect(createApi()('/api/x')).rejects.toMatchObject({
      code: 'HTTP_429',
      retryAfterMs: 3000,
    });
  });

  it('coupure réseau : NETWORK ; abandon par l’appelant : AbortError tel quel', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(createApi()('/api/x')).rejects.toMatchObject({ status: 0, code: 'NETWORK' });
    stubFetch(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(createApi()('/api/x')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('sans réponse à temps : TIMEOUT', async () => {
    stubFetch(
      (_url, init) =>
        new Promise((_, reject) =>
          init.signal!.addEventListener('abort', () => reject(init.signal!.reason)),
        ),
    );
    await expect(createApi({ timeoutMs: 20 })('/api/x')).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });
});

describe('réessais des lectures', () => {
  it('seulement les erreurs passagères, trois fois au plus', () => {
    expect(shouldRetryQuery(0, new ApiError(0, 'NETWORK', null))).toBe(true);
    expect(shouldRetryQuery(2, new ApiError(503, 'BUSY', null))).toBe(true);
    expect(shouldRetryQuery(3, new ApiError(503, 'BUSY', null))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError(409, 'NOT_ENOUGH_MONEY', null))).toBe(false);
    expect(shouldRetryQuery(0, new Error('autre'))).toBe(false);
  });

  it('délai : Retry-After, sinon 1 s, 2 s, 4 s, et 10 s au plus', () => {
    expect(retryDelay(0, new ApiError(0, 'NETWORK', null))).toBe(1000);
    expect(retryDelay(2, new ApiError(0, 'NETWORK', null))).toBe(4000);
    expect(retryDelay(9, new ApiError(0, 'NETWORK', null))).toBe(10_000);
    expect(retryDelay(0, new ApiError(429, 'HTTP_429', null, 5000))).toBe(5000);
  });
});
