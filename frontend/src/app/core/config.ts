declare global {
  interface Window {
    MONEYFLOW_CONFIG?: { apiUrl?: string };
  }
}

const API_URL_KEY = 'mf.apiUrl';

/**
 * Base URL of the .NET API. Empty means "same server that served this page" (the normal setup,
 * where the API serves the built app from wwwroot). When the UI is hosted elsewhere, such as
 * GitHub Pages, the address comes from public/config.js, and a user can override it in the app
 * (stored per device) — handy when a tunnel URL changes.
 */
export function apiBaseUrl(): string {
  return (storageGet(API_URL_KEY) || defaultApiUrl()).replace(/\/+$/, '');
}

export function defaultApiUrl(): string {
  return window.MONEYFLOW_CONFIG?.apiUrl ?? '';
}

/** Saves a per-device server address; empty clears it so config.js applies again. */
export function setApiUrlOverride(url: string): void {
  const clean = url.trim().replace(/\/+$/, '');
  storageSet(API_URL_KEY, clean && clean !== defaultApiUrl() ? clean : null);
}

/** True when the page is not served by the API itself (e.g. GitHub Pages), so a server address is needed. */
export function isStaticHost(): boolean {
  return location.hostname.endsWith('github.io');
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
