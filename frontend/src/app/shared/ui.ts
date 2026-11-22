import { Component, HostListener, computed, inject, input, model, output } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { I18nService, MoneyPipe, TPipe } from '../core/i18n/i18n.service';
import { toIso } from '../core/config';
import { ThemeService } from '../core/theme.service';
import { Period, Transaction } from '../core/models';

// Static, hand-written SVG paths (24×24, stroke icons). Trusted constants, never user input.
const ICONS: Record<string, string> = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="3"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M21 9h-6a3 3 0 0 0 0 6h6z"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><path d="M7.5 7.5h.01" stroke-width="3"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a7 7 0 0 1 14 0v1"/><path d="M16 4.1a4 4 0 0 1 0 7.8"/><path d="M22 21v-1a7 7 0 0 0-4-6.3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  more: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  in: '<path d="M17 7 7 17M17 17H7V7"/>',
  out: '<path d="M7 17 17 7M7 7h10v10"/>',
  swap: '<path d="m7 4-4 4 4 4M3 8h18M17 20l4-4-4-4M21 16H3"/>',
  report: '<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17v-8"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 14h6M9 17h4"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
};

@Component({
  selector: 'app-icon',
  template: `<svg
    viewBox="0 0 24 24"
    [attr.width]="size()"
    [attr.height]="size()"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    [innerHTML]="svg()"
  ></svg>`,
  styles: `:host { display: inline-flex; line-height: 0; }`,
})
export class Icon {
  private readonly sanitizer = inject(DomSanitizer);
  readonly name = input.required<string>();
  readonly size = input(17);
  protected readonly svg = computed(() => this.sanitizer.bypassSecurityTrustHtml(ICONS[this.name()] ?? ''));
}

/** Bottom sheet on phones, centered dialog on wider screens. */
@Component({
  selector: 'app-modal',
  imports: [Icon],
  template: `
    @if (open()) {
      <div class="modal-backdrop" (click)="closed.emit()">
        <div class="modal" role="dialog" aria-modal="true" [attr.aria-label]="title()" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <h2>{{ title() }}</h2>
            <button type="button" class="icon-btn" (click)="closed.emit()" aria-label="Close"><app-icon name="x" /></button>
          </div>
          <ng-content />
        </div>
      </div>
    }
  `,
})
export class Modal {
  readonly open = input(false);
  readonly title = input('');
  readonly closed = output<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) this.closed.emit();
  }
}

@Component({
  selector: 'app-month-picker',
  imports: [Icon, TPipe],
  template: `
    <div class="month-picker">
      <button type="button" class="icon-btn" (click)="shift(-1)" [attr.aria-label]="'action.prevMonth' | t">
        <app-icon name="chevron-left" />
      </button>
      <span class="month-label">{{ label() }}</span>
      <button type="button" class="icon-btn" (click)="shift(1)" [attr.aria-label]="'action.nextMonth' | t">
        <app-icon name="chevron-right" />
      </button>
    </div>
  `,
})
export class MonthPicker {
  private readonly i18n = inject(I18nService);
  readonly period = model.required<Period>();
  protected readonly label = computed(() => this.i18n.monthName(this.period().year, this.period().month));

  shift(delta: number): void {
    const p = this.period();
    const d = new Date(p.year, p.month - 1 + delta, 1);
    this.period.set({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
}

/** Sun / moon button that switches light and dark; sits next to the language button. */
@Component({
  selector: 'app-theme-toggle',
  imports: [Icon, TPipe],
  template: `
    @let dark = theme.theme() === 'dark';
    <button type="button" class="theme-toggle" (click)="theme.toggle()"
            [attr.aria-label]="(dark ? 'theme.toLight' : 'theme.toDark') | t" [title]="(dark ? 'theme.toLight' : 'theme.toDark') | t">
      <app-icon [name]="dark ? 'sun' : 'moon'" [size]="15" />
    </button>
  `,
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);
}

export type RangeMode = 'day' | 'month' | 'year';
/** A day, a month or a year, anchored on one date (yyyy-MM-dd). */
export interface DateRange {
  mode: RangeMode;
  anchor: string;
}

/** First and last date (inclusive) covered by a range. */
export function rangeBounds(r: DateRange): { from: string; to: string } {
  const [y, m] = r.anchor.split('-').map(Number);
  if (r.mode === 'day') return { from: r.anchor, to: r.anchor };
  if (r.mode === 'year') return { from: `${y}-01-01`, to: `${y}-12-31` };
  return { from: toIso(new Date(y, m - 1, 1)), to: toIso(new Date(y, m, 0)) };
}

/** Day / Month / Year switch plus ‹ label › stepping; tapping the label opens the native picker. */
@Component({
  selector: 'app-range-picker',
  imports: [Icon, TPipe],
  template: `
    <div class="range-picker">
      <div class="seg" role="group">
        @for (m of modes; track m) {
          <button type="button" [class.on]="range().mode === m" (click)="setMode(m)">{{ 'range.' + m | t }}</button>
        }
      </div>
      <div class="month-picker">
        <button type="button" class="icon-btn" (click)="shift(-1)" [attr.aria-label]="'action.prev' | t">
          <app-icon name="chevron-left" />
        </button>
        <label class="range-label">
          <span>{{ label() }}</span>
          @if (range().mode === 'day') {
            <input #pick type="date" [value]="range().anchor" (change)="pickDate(pick.value)" (click)="open(pick)" />
          } @else if (range().mode === 'month') {
            <input #pick type="month" [value]="range().anchor.slice(0, 7)" (change)="pickDate(pick.value + '-01')" (click)="open(pick)" />
          }
        </label>
        <button type="button" class="icon-btn" (click)="shift(1)" [attr.aria-label]="'action.next' | t">
          <app-icon name="chevron-right" />
        </button>
      </div>
    </div>
  `,
})
export class RangePicker {
  private readonly i18n = inject(I18nService);
  readonly range = model.required<DateRange>();
  protected readonly modes: RangeMode[] = ['day', 'month', 'year'];

  protected readonly label = computed(() => {
    const { mode, anchor } = this.range();
    const [y, m] = anchor.split('-').map(Number);
    if (mode === 'day') return this.i18n.date(anchor);
    if (mode === 'month') return this.i18n.monthName(y, m);
    return new Intl.DateTimeFormat(this.i18n.locale(), { year: 'numeric' }).format(new Date(y, 0, 1));
  });

  protected setMode(mode: RangeMode): void {
    this.range.update((r) => ({ ...r, mode }));
  }

  protected shift(delta: number): void {
    const { mode, anchor } = this.range();
    const [y, m, d] = anchor.split('-').map(Number);
    const next =
      mode === 'day' ? new Date(y, m - 1, d + delta) : mode === 'month' ? new Date(y, m - 1 + delta, 1) : new Date(y + delta, 0, 1);
    this.range.set({ mode, anchor: toIso(next) });
  }

  protected pickDate(value: string): void {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) this.range.update((r) => ({ ...r, anchor: value }));
  }

  protected open(input: HTMLInputElement): void {
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  }
}

/** "Shahadat Hossain" → "Shahadat"; keeps lists short. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

export function currentPeriod(): Period {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** One row in a transaction list. */
@Component({
  selector: 'app-tx-item',
  imports: [RouterLink, MoneyPipe],
  template: `
    @let t = tx();
    <a class="tx-item" [class.compact]="compact()" [routerLink]="['/transactions', t.id]">
      <span class="tx-icon" [style.background]="bg()">{{ icon() }}</span>
      <span class="tx-main">
        <span class="tx-title">{{ title() }}</span>
        <span class="tx-sub">
          @for (p of subParts(); track $index) {
            @if (!$first) { · }<span [class.tx-note]="p.note">{{ p.text }}</span>
          }
        </span>
      </span>
      <span class="tx-amount" [class]="t.type.toLowerCase()">
        {{ t.type === 'Expense' ? '-' : t.type === 'Income' ? '+' : '' }}{{ t.amount | money }}
      </span>
    </a>
  `,
})
export class TxItem {
  private readonly i18n = inject(I18nService);
  readonly tx = input.required<Transaction>();
  readonly showDate = input(false);
  /** One line per entry: title and details side by side, smaller icon. */
  readonly compact = input(false);

  protected readonly icon = computed(() => (this.tx().type === 'Transfer' ? '🔁' : (this.tx().categoryIcon ?? '📦')));
  protected readonly bg = computed(() => {
    const c = this.tx().type === 'Transfer' ? '#2563eb' : (this.tx().categoryColor ?? '#64748b');
    return /^#[0-9a-f]{6}$/i.test(c) ? `${c}22` : 'var(--surface-2)';
  });
  protected readonly title = computed(() => {
    const tx = this.tx();
    if (tx.type === 'Transfer') return this.i18n.t('type.Transfer');
    return this.i18n.catName(tx);
  });
  /** Date · account · note · member; the note is marked so it can stand out. */
  protected readonly subParts = computed(() => {
    const tx = this.tx();
    const parts: { text: string; note?: boolean }[] = [];
    if (this.showDate()) parts.push({ text: this.i18n.date(tx.date) });
    parts.push({ text: tx.type === 'Transfer' ? `${tx.accountName} → ${tx.toAccountName ?? ''}` : tx.accountName });
    if (tx.note) parts.push({ text: tx.note, note: true });
    if (tx.memberName) parts.push({ text: firstName(tx.memberName) });
    return parts;
  });
}
