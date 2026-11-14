import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { monthRange, todayIso } from '../../core/config';
import { I18N_PIPES, I18nService } from '../../core/i18n/i18n.service';
import { Account, Transaction, TransactionType, User } from '../../core/models';
import { XlsxCell, XlsxStyle, downloadXlsx } from '../../core/xlsx';
import { Icon } from '../../shared/ui';

export type ReportKind = 'range' | 'daily' | 'monthly' | 'yearly';

type Cell = string | number | null;
/** text: shown as is; count: whole number; money: amount with 2 decimals. */
type ColKind = 'text' | 'count' | 'money';

interface ReportCol {
  label: string;
  kind: ColKind;
  /** Width in the Excel file, in characters. */
  width: number;
}

export interface Report {
  kind: ReportKind;
  title: string;
  period: string;
  summary: { label: string; value: number }[];
  cols: ReportCol[];
  rows: Cell[][];
  total: Cell[];
  note: string;
  generated: string;
  fileName: string;
}

interface Params {
  kind: ReportKind;
  from: string;
  to: string;
  type?: TransactionType;
  accountId?: number;
  memberId?: string;
  /** Range report with any filter: the account total does not apply, so no opening/closing balance. */
  filtered: boolean;
}

interface Bucket {
  key: string;
  label: string;
  count: number;
  income: number;
  expense: number;
}

@Component({
  selector: 'app-reports',
  imports: [FormsModule, Icon, ...I18N_PIPES],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class ReportsPage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  protected readonly kinds: ReportKind[] = ['range', 'daily', 'monthly', 'yearly'];
  protected readonly types: (TransactionType | '')[] = ['', 'Income', 'Expense', 'Transfer'];
  private readonly thisYear = new Date().getFullYear();

  // Filters
  protected readonly kind = signal<ReportKind>('range');
  protected readonly from = signal(monthRange(this.thisYear, new Date().getMonth() + 1).from);
  protected readonly to = signal(todayIso());
  protected readonly type = signal<TransactionType | ''>('');
  protected readonly accountId = signal<number | null>(null);
  protected readonly memberId = signal<string | null>(null);
  protected readonly year = signal(this.thisYear);
  protected readonly fromYear = signal(this.thisYear);
  protected readonly toYear = signal(this.thisYear);

  // Lookups
  protected readonly accounts = signal<Account[]>([]);
  protected readonly members = signal<User[]>([]);
  private readonly firstYear = signal(this.thisYear);
  protected readonly years = computed(() => {
    const list: number[] = [];
    for (let y = this.thisYear; y >= Math.min(this.firstYear(), this.thisYear); y--) list.push(y);
    return list;
  });

  // Data
  private readonly loaded = signal<{ params: Params; txs: Transaction[]; opening: number | null } | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  private request = 0;

  private readonly params = computed<Params | null>(() => {
    const kind = this.kind();
    switch (kind) {
      case 'range': {
        const type = this.type() || undefined;
        const accountId = this.accountId() ?? undefined;
        const memberId = this.memberId() ?? undefined;
        const filtered = !!(type || accountId || memberId);
        return this.dates(kind, this.from(), this.to(), { type, accountId, memberId, filtered });
      }
      case 'daily':
        return this.dates(kind, this.from(), this.to());
      case 'monthly':
        return { kind, from: `${this.year()}-01-01`, to: `${this.year()}-12-31`, filtered: false };
      case 'yearly': {
        const a = Math.min(this.fromYear(), this.toYear());
        const b = Math.max(this.fromYear(), this.toYear());
        return { kind, from: `${a}-01-01`, to: `${b}-12-31`, filtered: false };
      }
    }
  });

  protected readonly report = computed<Report | null>(() => {
    const data = this.loaded();
    if (!data) return null;
    return data.params.kind === 'range' ? this.rangeReport(data.params, data.txs, data.opening) : this.summaryReport(data.params, data.txs, data.opening ?? 0);
  });

  constructor() {
    forkJoin([this.api.accounts(), this.api.users(), this.api.firstTransactionYear()]).subscribe({
      next: ([accounts, users, first]) => {
        this.accounts.set(accounts);
        this.members.set(users);
        if (first) {
          this.firstYear.set(first);
          this.fromYear.set(first);
        }
      },
      error: (e) => this.error.set(this.i18n.error(e)),
    });

    // Rebuild the report whenever the report type or a filter changes.
    effect(() => {
      const params = this.params();
      untracked(() => this.load(params));
    });
  }

  private dates(kind: ReportKind, from: string, to: string, extra?: Partial<Params>): Params | null {
    if (!from || !to || from > to) return null;
    return { kind, from, to, filtered: false, ...extra };
  }

  private load(params: Params | null): void {
    const id = ++this.request;
    this.error.set('');
    if (!params) {
      this.loaded.set(null);
      this.loading.set(false);
      this.error.set(this.i18n.t('rep.badRange'));
      return;
    }
    this.loading.set(true);
    forkJoin([
      this.api.reportTransactions({
        from: params.from,
        to: params.to,
        type: params.type,
        accountId: params.accountId,
        memberId: params.memberId,
      }),
      params.filtered ? of(null) : this.api.openingBalance(params.from),
    ]).subscribe({
      next: ([txs, opening]) => {
        if (id !== this.request) return;
        this.loaded.set({ params, txs, opening });
        this.loading.set(false);
      },
      error: (e) => {
        if (id !== this.request) return;
        this.loaded.set(null);
        this.loading.set(false);
        this.error.set(this.i18n.error(e));
      },
    });
  }

  // ------------------------------------------------------------ building the reports

  /** 1. Every entry in the date range, one row each. */
  private rangeReport(p: Params, txs: Transaction[], opening: number | null): Report {
    const t = (k: string) => this.i18n.t(k);
    let income = 0;
    let expense = 0;
    let transfer = 0;
    const rows: Cell[][] = txs.map((tx, i) => {
      const isTransfer = tx.type === 'Transfer';
      if (tx.type === 'Income') income += tx.amount;
      if (tx.type === 'Expense') expense += tx.amount;
      if (isTransfer) transfer += tx.amount;
      return [
        i + 1,
        this.i18n.date(tx.date),
        t(`type.${tx.type}`),
        isTransfer ? t('type.Transfer') : this.i18n.catName(tx),
        isTransfer ? `${tx.accountName} → ${tx.toAccountName ?? ''}` : tx.accountName,
        tx.memberName ?? '',
        tx.note ?? '',
        tx.type === 'Income' ? tx.amount : null,
        tx.type === 'Expense' ? tx.amount : null,
        isTransfer ? tx.amount : null,
      ];
    });

    const net = income - expense;
    const summary =
      opening === null
        ? [
            { label: t('rep.totalIncome'), value: income },
            { label: t('rep.totalExpense'), value: expense },
            { label: t('rep.net'), value: net },
          ]
        : [
            { label: t('rep.opening'), value: opening },
            { label: t('rep.totalIncome'), value: income },
            { label: t('rep.totalExpense'), value: expense },
            { label: t('rep.net'), value: net },
            { label: t('rep.closing'), value: opening + net },
          ];

    const filters: string[] = [];
    if (p.type) filters.push(`${t('field.type')}: ${t(`type.${p.type}`)}`);
    if (p.accountId) filters.push(`${t('field.account')}: ${this.accounts().find((a) => a.id === p.accountId)?.name ?? ''}`);
    if (p.memberId) filters.push(`${t('field.member')}: ${this.members().find((m) => m.id === p.memberId)?.name ?? ''}`);

    return {
      kind: p.kind,
      title: t('rep.title.range'),
      period: [this.rangeLabel(p.from, p.to), ...filters].join(' · '),
      summary,
      cols: [
        { label: t('rep.sl'), kind: 'count', width: 6 },
        { label: t('field.date'), kind: 'text', width: 14 },
        { label: t('field.type'), kind: 'text', width: 11 },
        { label: t('field.category'), kind: 'text', width: 20 },
        { label: t('field.account'), kind: 'text', width: 20 },
        { label: t('field.member'), kind: 'text', width: 16 },
        { label: t('field.note'), kind: 'text', width: 28 },
        { label: t('type.Income'), kind: 'money', width: 14 },
        { label: t('type.Expense'), kind: 'money', width: 14 },
        { label: t('type.Transfer'), kind: 'money', width: 14 },
      ],
      rows,
      total: [t('rep.total'), null, null, null, null, null, this.i18n.t('rep.entries', { n: txs.length }), income, expense, transfer],
      note: opening === null ? t('rep.noteFiltered') : t('rep.noteTransfer'),
      generated: this.generatedLine(),
      fileName: this.fileName(p),
    };
  }

  /** 2–4. One row per day / month / year with income, expense, net and the closing balance. */
  private summaryReport(p: Params, txs: Transaction[], opening: number): Report {
    const t = (k: string) => this.i18n.t(k);
    const buckets = this.buckets(p, txs);

    let balance = opening;
    let count = 0;
    let income = 0;
    let expense = 0;
    const rows: Cell[][] = buckets.map((b) => {
      const net = b.income - b.expense;
      balance += net;
      count += b.count;
      income += b.income;
      expense += b.expense;
      return [b.label, b.count, b.income, b.expense, net, balance];
    });
    const net = income - expense;

    const periodCol = { daily: 'field.date', monthly: 'rep.month', yearly: 'rep.year' }[p.kind as 'daily' | 'monthly' | 'yearly'];
    const period =
      p.kind === 'monthly'
        ? `${t('rep.year')}: ${this.yearLabel(Number(p.from.slice(0, 4)))}`
        : p.kind === 'yearly'
          ? `${this.yearLabel(Number(p.from.slice(0, 4)))} – ${this.yearLabel(Number(p.to.slice(0, 4)))}`
          : this.rangeLabel(p.from, p.to);

    return {
      kind: p.kind,
      title: t(`rep.title.${p.kind}`),
      period,
      summary: [
        { label: t('rep.opening'), value: opening },
        { label: t('rep.totalIncome'), value: income },
        { label: t('rep.totalExpense'), value: expense },
        { label: t('rep.net'), value: net },
        { label: t('rep.closing'), value: opening + net },
      ],
      cols: [
        { label: t(periodCol), kind: 'text', width: 20 },
        { label: t('rep.entryCount'), kind: 'count', width: 10 },
        { label: t('type.Income'), kind: 'money', width: 16 },
        { label: t('type.Expense'), kind: 'money', width: 16 },
        { label: t('rep.net'), kind: 'money', width: 16 },
        { label: t('rep.balance'), kind: 'money', width: 18 },
      ],
      rows,
      total: [t('rep.total'), count, income, expense, net, opening + net],
      note: p.kind === 'daily' ? `${t('rep.noteDaily')} ${t('rep.noteTransfer')}` : t('rep.noteTransfer'),
      generated: this.generatedLine(),
      fileName: this.fileName(p),
    };
  }

  /** Groups entries by day / month / year. Months and years without entries are still listed (up to today). */
  private buckets(p: Params, txs: Transaction[]): Bucket[] {
    const map = new Map<string, Bucket>();
    const add = (key: string, label: string) => {
      if (!map.has(key)) map.set(key, { key, label, count: 0, income: 0, expense: 0 });
    };
    const today = todayIso();

    if (p.kind === 'monthly') {
      const y = Number(p.from.slice(0, 4));
      for (let m = 1; m <= 12; m++) {
        const key = `${y}-${String(m).padStart(2, '0')}`;
        if (key <= today.slice(0, 7)) add(key, this.i18n.monthName(y, m));
      }
    } else if (p.kind === 'yearly') {
      for (let y = Number(p.from.slice(0, 4)); y <= Number(p.to.slice(0, 4)); y++) {
        if (y <= this.thisYear) add(String(y), this.yearLabel(y));
      }
    }

    for (const tx of txs) {
      const key = p.kind === 'daily' ? tx.date : p.kind === 'monthly' ? tx.date.slice(0, 7) : tx.date.slice(0, 4);
      if (!map.has(key)) {
        const label =
          p.kind === 'daily'
            ? this.i18n.date(tx.date)
            : p.kind === 'monthly'
              ? this.i18n.monthName(Number(key.slice(0, 4)), Number(key.slice(5, 7)))
              : this.yearLabel(Number(key));
        add(key, label);
      }
      const b = map.get(key)!;
      b.count++;
      if (tx.type === 'Income') b.income += tx.amount;
      if (tx.type === 'Expense') b.expense += tx.amount;
    }
    return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }

  // ------------------------------------------------------------ formatting

  private readonly amountFmt = computed(
    () => new Intl.NumberFormat(this.i18n.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  );
  private readonly yearFmt = computed(() => new Intl.NumberFormat(this.i18n.locale(), { useGrouping: false }));

  protected cell(value: Cell, kind: ColKind): string {
    if (value === null || value === '') return '';
    if (typeof value === 'string') return value;
    return kind === 'money' ? this.amountFmt().format(value) : this.i18n.number(value);
  }

  protected amount(n: number): string {
    return this.amountFmt().format(n);
  }

  private yearLabel(y: number): string {
    return this.yearFmt().format(y);
  }

  private rangeLabel(from: string, to: string): string {
    return from === to ? this.i18n.date(from, 'long') : `${this.i18n.date(from)} – ${this.i18n.date(to)}`;
  }

  private generatedLine(): string {
    const when = new Intl.DateTimeFormat(this.i18n.locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
    return this.i18n.t('rep.generated', { when, name: this.auth.user()?.name ?? '' });
  }

  private fileName(p: Params): string {
    const part = p.kind === 'monthly' ? p.from.slice(0, 4) : p.kind === 'yearly' ? `${p.from.slice(0, 4)}-${p.to.slice(0, 4)}` : `${p.from}_${p.to}`;
    const name = { range: 'Transactions', daily: 'Date-wise', monthly: 'Month-wise', yearly: 'Year-wise' }[p.kind];
    return `MoneyFlow_${name}_${part}`;
  }

  protected kindLabel(k: ReportKind): string {
    return this.i18n.t(`rep.kind.${k}`);
  }

  protected typeLabel(t: TransactionType | ''): string {
    return this.i18n.t(t ? `type.${t}` : 'type.all');
  }

  // ------------------------------------------------------------ export

  /**
   * PDF through the browser's print dialog ("Save as PDF"), which renders Bangla text correctly
   * (PDF libraries in the browser cannot shape Bangla letters). Print styles show only the report.
   */
  protected exportPdf(): void {
    const r = this.report();
    if (!r) return;
    const title = document.title;
    document.title = r.fileName;
    const restore = () => (document.title = title);
    window.addEventListener('afterprint', restore, { once: true });
    window.print();
    setTimeout(restore, 3000);
  }

  protected exportExcel(): void {
    const r = this.report();
    if (!r) return;
    const width = r.cols.length;
    const pad = (cells: XlsxCell[]) => [...cells, ...Array<XlsxCell>(Math.max(0, width - cells.length)).fill({ value: null })];

    const rows: XlsxCell[][] = [
      [{ value: this.i18n.t('app.name'), style: XlsxStyle.title }],
      [{ value: r.title, style: XlsxStyle.bold }],
      [{ value: r.period }],
      [{ value: r.generated }],
      [],
      ...r.summary.map((s) => [
        { value: s.label, style: XlsxStyle.bold },
        { value: round(s.value), style: XlsxStyle.boldNumber },
      ]),
      [],
      r.cols.map((c) => ({ value: c.label, style: XlsxStyle.header })),
      ...r.rows.map((row) =>
        row.map((v, i) => ({
          value: typeof v === 'number' ? round(v) : v,
          style: r.cols[i].kind === 'money' ? XlsxStyle.number : XlsxStyle.text,
        })),
      ),
      pad(
        r.total.map((v, i) => ({
          value: typeof v === 'number' ? round(v) : v,
          style: r.cols[i].kind === 'money' ? XlsxStyle.totalNumber : XlsxStyle.totalText,
        })),
      ),
      [],
      [{ value: r.note }],
    ];
    if (!r.rows.length) rows.splice(rows.length - 3, 0, [{ value: this.i18n.t('rep.empty') }]);

    downloadXlsx(r.fileName, { name: r.title, rows, widths: r.cols.map((c) => c.width) });
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
