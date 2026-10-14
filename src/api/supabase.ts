import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && anonKey);

// The device name rides along on every request; the database records it in
// the transaction log.
export function deviceName(): string {
  try {
    const saved = localStorage.getItem('fbla-device');
    if (saved) return saved;
  } catch {
    // Storage blocked: fall through.
  }
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/CrOS/.test(ua)) return 'Chromebook';
  if (/iPhone|Android/.test(ua)) return 'Phone';
  if (/iPad|Tablet/.test(ua)) return 'Tablet';
  return 'Browser';
}

export function setDeviceName(name: string) {
  try {
    localStorage.setItem('fbla-device', name.trim().slice(0, 60));
  } catch {
    // Ignore.
  }
}

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  global: { headers: { 'x-fbla-device': deviceName() } },
});
