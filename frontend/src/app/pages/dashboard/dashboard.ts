import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18N_PIPES, I18nService } from '../../core/i18n/i18n.service';
import { todayIso } from '../../core/config';
import {
  ACCOUNT_ICONS,
  BalanceSummary,
  CategoryTotal,
  Dashboard,
  MemberTotal,
  MonthTotal,
  Transaction,
  TransactionPage,
} from '../../core/models';
import { DateRange, Icon, RangePicker, TxItem, firstName, rangeBounds } from '../../shared/ui';

type RangeStats = Pick<Dashboard, 'year' | 'month' | 'income' | 'expense' | 'net' | 'expenseByCategory' | 'expenseByMember'> &
  Partial<Pick<Dashboard, 'trend'>>;

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, Icon, RangePicker, TxItem, ...I18N_PIPES],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPage {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  protected readonly accountIcons = ACCOUNT_ICONS;
  protected readonly firstName = firstName;

  /** Day, month (default) or year the numbers below are for. */
  protected readonly range = signal<DateRange>({ mode: 'month', anchor: todayIso() });
  /** Month summary from the server (accounts, recent, 6-month trend, and the month's numbers). */
  private readonly base = signal<Dashboard | null>(null);
  /** Day / year numbers worked out in the browser; null in month view. */
  private readonly rangeStats = signal<RangeStats | null>(null);
  private loadSeq = 0;
  private baseKey = '';
  /** What the page shows: the server month summary, with day / year numbers laid over it. */
  protected readonly data = computed<Dashboard | null>(() => {
    const b = this.base();
    if (!b) return null;
    if (this.range().mode === 'month') return b;
    const s = this.rangeStats();
    return s ? { ...b, ...s } : null;
  });
  protected readonly error = signal('');
  /** Open receivable / payable totals (all time). */
  protected readonly summary = signal<BalanceSummary | null>(null);
  /** Entries of the selected day / month / year, 10 per page. */
  protected readonly activity = signal<TransactionPage | null>(null);
  protected readonly actPage = signal(1);
  protected readonly actPageSize = 10;
  protected readonly actPages = computed(() => Math.max(1, Math.ceil((this.activity()?.total ?? 0) / this.actPageSize)));
  protected readonly isToday = computed(() => this.range().mode === 'day' && this.range().anchor === todayIso());

  protected readonly maxCategory = computed(() => Math.max(1, ...(this.data()?.expenseByCategory.map((c) => c.amount) ?? [])));
  protected readonly maxMember = computed(() => Math.max(1, ...(this.data()?.expenseByMember.map((m) => m.amount) ?? [])));
  protected readonly maxTrend = computed(() =>
    Math.max(1, ...(this.data()?.trend.flatMap((t) => [t.income, t.expense]) ?? [])),
  );
  /** Last 6 months, newest month first (left). */
  protected readonly trendNewestFirst = computed(() => [...(this.data()?.trend ?? [])].reverse());
  protected readonly savingsRate = computed(() => {
    const d = this.data();
    return d && d.income > 0 ? Math.round((d.net / d.income) * 100) : null;
  });

  constructor() {
    this.api.balanceSummary().subscribe({
      next: (s) => this.summary.set(s),
      error: () => this.summary.set(null),
    });
    effect(() => {
      const r = this.range();
      untracked(() => {
        this.load(r);
        this.actPage.set(1);
      });
    });
    effect(() => {
      const r = this.range();
      const page = this.actPage();
      untracked(() => this.loadActivity(r, page));
    });
  }

  private load(r: DateRange): void {
    const seq = ++this.loadSeq;
    const [y, m] = r.anchor.split('-').map(Number);
    this.error.set('');
    this.rangeStats.set(null);
    const fail = (e: unknown) => seq === this.loadSeq && this.error.set(this.i18n.error(e));

    const key = `${y}-${m}`;
    if (key !== this.baseKey) {
      this.baseKey = key; // the month summary is only re-read when the month changes
      this.api.dashboard(y, m).subscribe({
        next: (d) => key === this.baseKey && this.base.set(d),
        error: (e) => {
          if (key === this.baseKey) this.baseKey = '';
          fail(e);
        },
      });
    }
    if (r.mode !== 'month') {
      this.api.reportTransactions(rangeBounds(r)).subscribe({
        next: (list) => seq === this.loadSeq && this.rangeStats.set(this.aggregate(list, r, y, m)),
        error: fail,
      });
    }
  }

  /** Same numbers the dashboard RPC gives for a month, for any list of entries. */
  private aggregate(list: Transaction[], r: DateRange, y: number, m: number): RangeStats {
    let income = 0;
    let expense = 0;
    const cats = new Map<number | null, CategoryTotal>();
    const members = new Map<string | null, MemberTotal>();
    const months = new Map<number, MonthTotal>();
    if (r.mode === 'year') {
      const now = new Date();
      const last = y === now.getFullYear() ? now.getMonth() + 1 : 12; // no empty future months
      for (let i = 1; i <= last; i++) months.set(i, { year: y, month: i, income: 0, expense: 0 });
    }
    for (const t of list) {
      const mt = months.get(Number(t.date.slice(5, 7)));
      if (t.type === 'Income') {
        income += t.amount;
        if (mt) mt.income += t.amount;
      } else if (t.type === 'Expense') {
        expense += t.amount;
        if (mt) mt.expense += t.amount;
        const c = cats.get(t.categoryId) ?? {
          categoryId: t.categoryId,
          nameEn: t.categoryNameEn ?? '',
          nameBn: t.categoryNameBn ?? '',
          icon: t.categoryIcon ?? '📦',
          color: t.categoryColor ?? '#64748b',
          amount: 0,
        };
        c.amount += t.amount;
        cats.set(t.categoryId, c);
        const mb = members.get(t.memberId) ?? { memberId: t.memberId, name: t.memberName ?? '', amount: 0 };
        mb.amount += t.amount;
        members.set(t.memberId, mb);
      }
    }
    const byAmount = <T extends { amount: number }>(a: T, b: T) => b.amount - a.amount;
    return {
      year: y,
      month: m,
      income,
      expense,
      net: income - expense,
      expenseByCategory: [...cats.values()].sort(byAmount),
      expenseByMember: [...members.values()].sort(byAmount),
      ...(r.mode === 'year' ? { trend: [...months.values()] } : {}),
    };
  }

  private actSeq = 0;
  private loadActivity(r: DateRange, page: number): void {
    const seq = ++this.actSeq;
    this.api.transactions({ ...rangeBounds(r), page, pageSize: this.actPageSize }).subscribe({
      next: (p) => seq === this.actSeq && this.activity.set(p), // ignore late answers
      error: () => seq === this.actSeq && this.activity.set(null),
    });
  }

  protected goActPage(delta: number): void {
    const next = Math.min(this.actPages(), Math.max(1, this.actPage() + delta));
    if (next !== this.actPage()) this.actPage.set(next);
  }

  protected pct(value: number, max: number): number {
    return Math.max(2, Math.round((value / max) * 100));
  }
}
