import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { monthRange } from '../../core/config';
import { I18N_PIPES, I18nService } from '../../core/i18n/i18n.service';
import { Account, Period, Transaction, TransactionQuery, TransactionType, User } from '../../core/models';
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
  protected readonly i18n = inject(I18nService);

  // Filters
  protected readonly period = signal<Period>(currentPeriod());
  protected readonly type = signal<TransactionType | ''>('');
  protected readonly accountId = signal<number | null>(null);
  protected readonly memberId = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly types: (TransactionType | '')[] = ['', 'Expense', 'Income', 'Transfer'];

  // Data
  protected readonly accounts = signal<Account[]>([]);
  protected readonly members = signal<User[]>([]);
  protected readonly items = signal<Transaction[]>([]);
  protected readonly total = signal(0);
  protected readonly totalIncome = signal(0);
  protected readonly totalExpense = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
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

  protected typeLabel(t: TransactionType | ''): string {
    return this.i18n.t(t ? `type.${t}` : 'type.all');
  }
}
