import { NetworkError, isTransientFailure } from '../lib/offline';
import { deviceName, supabase } from './supabase';

export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function isFetchFailure(message: string) {
  return /Failed to fetch|NetworkError|Load failed|fetch failed/i.test(message);
}

// What to tell people when the server did not really answer. Gateways send
// HTML error pages, which are no use on screen.
function transientMessage(status: number, fallback: string) {
  if (status === 0) return fallback || 'No connection to the server.';
  if (status === 408 || status === 504) return 'The server took too long. Try again.';
  if (status === 429) return 'The server is busy. Try again in a minute.';
  return 'The server is having trouble. Try again in a minute.';
}

// Every database call goes through here. Errors come back as ApiError with
// the database's own message, which is written for people. A call that
// failed for a passing reason (no connection, timeout, rate limit, server or
// gateway trouble) throws NetworkError instead, so the register queues the
// sale rather than losing it.
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error, status } = await supabase.rpc(fn, args);
  if (error) {
    if (isFetchFailure(error.message)) throw new NetworkError(error.message);
    if (isTransientFailure(status, error.code)) throw new NetworkError(transientMessage(status, error.message));
    throw new ApiError(error.message, error.code);
  }
  return data as T;
}

// For RPCs that answer {ok: false, error, message} instead of raising
// (wrong PIN, officer needed, note needed).
export async function rpcResult<T extends { ok?: boolean }>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const data = await rpc<T & { error?: string; message?: string }>(fn, args);
  if (data && data.ok === false) {
    throw new ApiError(data.message ?? 'That did not work.', data.error, data as Record<string, unknown>);
  }
  return data;
}

// Netlify Functions, proxied at /api/* to the backend site.
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  let res: Response;
  try {
    res = await fetch(`${import.meta.env.VITE_FUNCTIONS_URL ?? '/api'}/${name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-fbla-device': deviceName(),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new NetworkError(err instanceof Error ? err.message : 'offline');
  }
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    if (text) json = JSON.parse(text);
  } catch {
    // Not JSON (for example the functions site is not running, or Netlify
    // cut the function off at its time limit and sent its own page).
  }
  if (!res.ok) {
    // Our functions always answer errors in JSON with a message for people
    // (sams-lookup's own 504 says to paste the page text instead), so keep
    // those. A 5xx without it came from the gateway (Netlify cut the
    // function off at its time limit, or the functions site is down): the
    // function never really answered, so say that in words, as a
    // NetworkError like a dropped connection.
    if (res.status >= 500 && typeof json?.message !== 'string') {
      throw new NetworkError(transientMessage(/timed? ?out/i.test(text) ? 504 : res.status, ''));
    }
    throw new ApiError(String(json?.message ?? `The server answered ${res.status}.`), String(json?.error ?? res.status));
  }
  if (text && !json) throw new ApiError('The server sent something the app could not read. Try again.', 'bad_response');
  return (json ?? {}) as T;
}

export async function checkHealth(): Promise<{ ok: boolean; configured?: Record<string, boolean> }> {
  const res = await fetch(`${import.meta.env.VITE_FUNCTIONS_URL ?? '/api'}/health`);
  if (!res.ok) throw new Error(`health ${res.status}`);
  return res.json();
}
