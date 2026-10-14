import { NetworkError } from '../lib/offline';
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

// Every database call goes through here. Errors come back as ApiError with
// the database's own message, which is written for people.
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (isFetchFailure(error.message)) throw new NetworkError(error.message);
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
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // Not JSON (for example the functions site is not running).
  }
  if (!res.ok) {
    throw new ApiError(String(json.message ?? `The server answered ${res.status}.`), String(json.error ?? res.status));
  }
  return json as T;
}

export async function checkHealth(): Promise<{ ok: boolean; configured?: Record<string, boolean> }> {
  const res = await fetch(`${import.meta.env.VITE_FUNCTIONS_URL ?? '/api'}/health`);
  if (!res.ok) throw new Error(`health ${res.status}`);
  return res.json();
}
