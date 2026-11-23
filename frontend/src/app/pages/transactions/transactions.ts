import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { monthRange } from '../../core/config';
import { I18N_PIPES, I18nService } from '../../core/i18n/i18n.service';
import { Account, BalanceSummary, Period, Transaction, TransactionQuery, TransactionType, User } from '../../core/models';
import { Icon, MonthPicker, TxItem, currentPeriod } from '../../shared/ui';

const PAGE_SIZE = 50;

@Component({
  selector: 'app-transactions',
  imports: [FormsModule, RouterLink, MonthPicker, TxItem, Icon, ...I18N_PIPES],
  templateUrl: './transactions.html',
  styleUrl: './transactions.scss',
})
export class TransactionsPage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  // Filters
  protected readonly period = signal<Period>(currentPeriod());
  protected readonly type = signal<TransactionType | ''>('');
  protected readonly accountId = signal<number | null>(null);
  protected readonly memberId = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly types: (TransactionType | '')[] = ['', 'Expense', 'Income', 'Transfer'];
  protected readonly typeIcon: Record<TransactionType | '', string> = {
    '': 'list', Expense: 'out', Income: 'in', Transfer: 'swap',
  };

  // Data
  protected readonly accounts = signal<Account[]>([]);
  protected readonly members = signal<User[]>([]);
  protected readonly items = signal<Transaction[]>([]);
  protected readonly total = signal(0);
  protected readonly totalIncome = signal(0);
  protected readonly totalExpense = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  /** Date whose entries are being deleted right now. */
  protected readonly deleting = signal<string | null>(null);
  /** Balance / receivable / payable / actual balance (not limited to the selected month). */
  protected readonly summary = signal<BalanceSummary | null>(null);
  private page = 1;

  protected readonly hasMore = computed(() => this.items().length < this.total());

  /** Entries grouped by day, newest first, with the day's net amount. */
  protected readonly days = computed(() => {
    const groups: { date: string; net: number; items: Transaction[] }[] = [];
    for (const tx of this.items()) {
      let g = groups[groups.length - 1];
      if (!g || g.date !== tx.date) {
        g = { date: tx.date, net: 0, items: [] };
        groups.push(g);
      }
      g.items.push(tx);
      if (tx.type === 'Income') g.net += tx.amount;
      if (tx.type === 'Expense') g.net -= tx.amount;
    }
    return groups;
  });

  constructor() {
    forkJoin([this.api.accounts(), this.api.users()]).subscribe({
      next: ([accounts, users]) => {
        this.accounts.set(accounts);
        this.members.set(users);
      },
      error: (e) => this.error.set(this.i18n.error(e)),
    });

    this.loadSummary();

    // Reload from page 1 whenever any filter changes.
    effect(() => {
      const query = this.query();
      untracked(() => this.load(query, true));
    });
  }

  private readonly query = computed<TransactionQuery>(() => {
    const p = this.period();
    const { from, to } = monthRange(p.year, p.month);
    return {
      from,
      to,
      type: this.type() || undefined,
      accountId: this.accountId() ?? undefined,
      memberId: this.memberId() ?? undefined,
      search: this.search().trim() || undefined,
      pageSize: PAGE_SIZE,
    };
  });

  private loadSummary(): void {
    this.api.balanceSummary().subscribe({
      next: (s) => this.summary.set(s),
      error: () => this.summary.set(null),
    });
  }

  protected loadMore(): void {
    this.load(this.query(), false);
  }

  private load(query: TransactionQuery, reset: boolean): void {
    this.page = reset ? 1 : this.page + 1;
    this.loading.set(true);
    this.error.set('');
    this.api.transactions({ ...query, page: this.page }).subscribe({
      next: (res) => {
        this.items.set(reset ? res.items : [...this.items(), ...res.items]);
        this.total.set(res.total);
        this.totalIncome.set(res.totalIncome);
        this.totalExpense.set(res.totalExpense);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(this.i18n.error(e));
        this.loading.set(false);
      },
    });
  }

  /** Deletes every entry listed under one day (respecting the current filters). */
  protected deleteDay(day: { date: string; items: Transaction[] }): void {
    if (this.deleting()) return;
    const mine = this.auth.isAdmin() ? day.items : day.items.filter((t) => t.createdById === this.auth.user()?.id);
    if (!mine.length) return this.error.set(this.i18n.t('err.FORBIDDEN'));

    const question = this.i18n.t('tx.confirmDeleteDay', { date: this.i18n.date(day.date, 'long'), n: mine.length });
    const skipped = day.items.length - mine.length;
    if (!confirm(skipped ? `${question}\n\n${this.i18n.t('tx.othersKept', { n: skipped })}` : question)) return;

    this.deleting.set(day.date);
    this.error.set('');
    this.api.deleteTransactions(mine.map((t) => t.id)).subscribe({
      next: () => {
        this.deleting.set(null);
        this.load(this.query(), true);
        this.loadSummary();
      },
      error: (e) => {
        this.deleting.set(null);
        this.error.set(this.i18n.error(e));
      },
    });
  }

  /** Whether the current user may delete at least one entry of the day. */
  protected canDeleteDay(items: Transaction[]): boolean {
    const me = this.auth.user()?.id;
    return this.auth.isAdmin() || items.some((t) => t.createdById === me);
  }

  protected typeLabel(t: TransactionType | ''): string {
    return this.i18n.t(t ? `type.${t}` : 'type.all');
  }
}
