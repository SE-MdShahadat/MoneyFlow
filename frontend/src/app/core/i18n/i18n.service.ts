import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, Pipe, PipeTransform, computed, effect, inject, signal } from '@angular/core';
import { storageGet, storageSet } from '../config';
import { Lang, TRANSLATIONS } from './translations';

const LANG_KEY = 'mf.lang';

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang = signal<Lang>(storageGet(LANG_KEY) === 'en' ? 'en' : 'bn');
  readonly locale = computed(() => (this.lang() === 'bn' ? 'bn-BD' : 'en-IN'));

  private readonly numberFmt = computed(
    () => new Intl.NumberFormat(this.locale(), { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
  );

  constructor() {
    effect(() => {
      const lang = this.lang();
      storageSet(LANG_KEY, lang);
      document.documentElement.lang = lang;
    });
  }

  toggle(): void {
    this.lang.update((l) => (l === 'bn' ? 'en' : 'bn'));
  }

  t(key: string, params?: Record<string, string | number>): string {
    let text = TRANSLATIONS[this.lang()][key] ?? TRANSLATIONS.en[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, typeof v === 'number' ? this.number(v) : v);
      }
    }
    return text;
  }

  has(key: string): boolean {
    return key in TRANSLATIONS[this.lang()];
  }

  number(n: number): string {
    return this.numberFmt().format(n);
  }

  /** ৳ amount, with Bangla digits when the language is Bangla. */
  money(n: number | null | undefined, signed = false): string {
    const value = n ?? 0;
    const sign = value < 0 ? '-' : signed && value > 0 ? '+' : '';
    return `${sign}৳${this.number(Math.abs(value))}`;
  }

  /** Formats a yyyy-MM-dd date string. */
  date(iso: string, style: 'short' | 'long' = 'short'): string {
    const [y, m, d] = iso.split('-').map(Number);
    const options: Intl.DateTimeFormatOptions =
      style === 'long'
        ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
        : { day: 'numeric', month: 'short', year: 'numeric' };
    return new Intl.DateTimeFormat(this.locale(), options).format(new Date(y, m - 1, d));
  }

  monthName(year: number, month: number, short = false): string {
    const options: Intl.DateTimeFormatOptions = short ? { month: 'short' } : { month: 'long', year: 'numeric' };
    return new Intl.DateTimeFormat(this.locale(), options).format(new Date(year, month - 1, 1));
  }

  /** Category name in the current language. */
  catName(c: { nameEn?: string | null; nameBn?: string | null; categoryNameEn?: string | null; categoryNameBn?: string | null }): string {
    const enName = c.nameEn ?? c.categoryNameEn ?? '';
    const bnName = c.nameBn ?? c.categoryNameBn ?? '';
    return this.lang() === 'bn' ? bnName || enName : enName || bnName;
  }

  /** Turns an API error into a message in the current language. */
  error(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) return this.t('err.network');
      const code = err.error?.code as string | undefined;
      if (code && this.has(`err.${code}`)) return this.t(`err.${code}`);
      if (err.status === 400) return this.t('err.validation');
      if (typeof err.error?.message === 'string') return err.error.message;
    }
    return this.t('err.generic');
  }
}

/** `{{ 'key' | t }}` — impure so it re-renders when the language changes. */
@Pipe({ name: 't', pure: false })
export class TPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  transform(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }
}

@Pipe({ name: 'money', pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  transform(value: number | null | undefined, signed = false): string {
    return this.i18n.money(value, signed);
  }
}

@Pipe({ name: 'bdate', pure: false })
export class DatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  transform(value: string, style: 'short' | 'long' = 'short'): string {
    return this.i18n.date(value, style);
  }
}

@Pipe({ name: 'num', pure: false })
export class NumPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  transform(value: number): string {
    return this.i18n.number(value);
  }
}

export const I18N_PIPES = [TPipe, MoneyPipe, DatePipe, NumPipe] as const;
