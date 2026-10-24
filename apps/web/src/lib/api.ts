import { tabProfile } from './tab-profile';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: unknown,
  ) {
    super(code);
  }
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const profile = tabProfile();
  const res = await fetch(path, {
    credentials: 'include',
    ...rest,
    headers: {
      ...(json !== undefined && { 'content-type': 'application/json' }),
      ...(profile && { 'x-dex-profile': profile }),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = (body as { error?: string } | null)?.error ?? `HTTP_${res.status}`;
    throw new ApiError(res.status, code, body);
  }
  return body as T;
}
