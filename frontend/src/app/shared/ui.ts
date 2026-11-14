import { Component, HostListener, computed, inject, input, model, output } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { I18nService, MoneyPipe, TPipe } from '../core/i18n/i18n.service';
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
    <a class="tx-item" [routerLink]="['/transactions', t.id]">
      <span class="tx-icon" [style.background]="bg()">{{ icon() }}</span>
      <span class="tx-main">
        <span class="tx-title">{{ title() }}</span>
        <span class="tx-sub">{{ sub() }}</span>
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
  protected readonly sub = computed(() => {
    const tx = this.tx();
    const parts: string[] = [];
    if (this.showDate()) parts.push(this.i18n.date(tx.date));
    parts.push(tx.type === 'Transfer' ? `${tx.accountName} → ${tx.toAccountName ?? ''}` : tx.accountName);
    if (tx.memberName) parts.push(tx.memberName);
    if (tx.note) parts.push(tx.note);
    return parts.join(' · ');
  });
}
