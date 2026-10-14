import { createClient } from '@supabase/supabase-js';
import { cleanDeviceName, defaultDeviceName } from '../lib/device';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && anonKey);

const DEVICE_KEY = 'fbla-device';

// The device name rides along on every request; the database records it in
// the transaction log. It is cleaned on the way out too, so a name saved
// before cleaning existed (one with a curly apostrophe, say) heals on the
// next load instead of breaking every request.
export function deviceName(): string {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved) {
      const clean = cleanDeviceName(saved);
      if (clean !== saved) {
        if (clean) localStorage.setItem(DEVICE_KEY, clean);
        else localStorage.removeItem(DEVICE_KEY);
      }
      if (clean) return clean;
    }
  } catch {
    // Storage blocked: fall through.
  }
  return defaultDeviceName(typeof navigator === 'undefined' ? '' : navigator.userAgent);
}

// Saves the cleaned name and returns the name requests will now carry (the
// generated default when nothing printable is left).
export function setDeviceName(name: string): string {
  const clean = cleanDeviceName(name);
  try {
    if (clean) localStorage.setItem(DEVICE_KEY, clean);
    else localStorage.removeItem(DEVICE_KEY);
  } catch {
    // Ignore.
  }
  return deviceName();
}

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  global: { headers: { 'x-fbla-device': deviceName() } },
});
