import { SupabaseClient, createClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    MONEYFLOW_CONFIG?: { supabaseUrl?: string; supabaseKey?: string };
  }
}

let client: SupabaseClient | null = null;

/** The single Supabase client, configured from public/config.js. */
export function supabase(): SupabaseClient {
  if (!client) {
    const cfg = window.MONEYFLOW_CONFIG ?? {};
    if (!cfg.supabaseUrl || !cfg.supabaseKey) {
      throw new Error('Supabase is not configured. Set supabaseUrl and supabaseKey in config.js.');
    }
    client = createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mf.auth' },
    });
  }
  return client;
}

export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) — app still works for this session */
  }
}

/** Today's date as yyyy-MM-dd in the device's local time zone. */
export function todayIso(): string {
  return toIso(new Date());
}

export function toIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthRange(year: number, month: number): { from: string; to: string } {
  return { from: toIso(new Date(year, month - 1, 1)), to: toIso(new Date(year, month, 0)) };
}
