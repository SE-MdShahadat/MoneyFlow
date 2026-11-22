import { Injectable, effect, signal } from '@angular/core';
import { storageGet, storageSet } from './config';

export type Theme = 'light' | 'dark';
const THEME_KEY = 'mf.theme';

/** Light / dark. Starts from the saved choice, else the device setting; the choice is kept on this device. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(initialTheme());

  constructor() {
    effect(() => {
      const t = this.theme();
      document.documentElement.dataset['theme'] = t;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0b1220' : '#0f766e');
    });
  }

  toggle(): void {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
    storageSet(THEME_KEY, this.theme());
  }
}

function initialTheme(): Theme {
  const saved = storageGet(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}
