import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { storageGet, storageSet, toIso, todayIso } from '../../core/config';
import { I18N_PIPES, I18nService } from '../../core/i18n/i18n.service';
import { Account, Category, Transaction, TransactionSave, TransactionType, User } from '../../core/models';
import { Icon } from '../../shared/ui';

const LAST_ACCOUNT_KEY = 'mf.lastAccount';
/** Most entries one multi-day save may create. */
const MAX_DAYS = 62;

/** One line of the "many entries on one date" form. */
interface BatchRow {
  key: number;
  type: TransactionType;
  amount: number | null;
  accountId: number | null;
  toAccountId: number | null;
  categoryId: number | null;
  memberId: string | null;
  note: string;
}

@Component({
  selector: 'app-transaction-form',
  imports: [FormsModule, RouterLink, Icon, ...I18N_PIPES],
  templateUrl: './transaction-form.html',
  styleUrl: './transaction-form.scss',
})
export class TransactionFormPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  protected readonly i18n = inject(I18nService);

  protected readonly types: TransactionType[] = ['Expense', 'Income', 'Transfer'];

  protected readonly id = signal<number | null>(null);
  protected readonly existing = signal<Transaction | null>(null);
  protected readonly ready = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly allAccounts = signal<Account[]>([]);
  protected readonly allCategories = signal<Category[]>([]);
  protected readonly members = signal<User[]>([]);

  // Form state
  protected readonly type = signal<TransactionType>('Expense');
  protected readonly categoryId = signal<number | null>(null);
  protected form = {
    amount: null as number | null,
    date: todayIso(),
    accountId: null as number | null,
    toAccountId: null as number | null,
    memberId: null as string | null,
    note: '',
  };

  /** New entries: 'batch' = one date with many rows (default); 'single' = the classic form with multi-day. */
  protected readonly mode = signal<'batch' | 'single'>('batch');
  protected batchDate = todayIso();
  protected readonly rows = signal<BatchRow[]>([]);
  private nextRowKey = 1;

  // Multi-day: the same entry saved once per day from form.date to toDate (new entries only).
  protected readonly multiDay = signal(false);
  protected toDate = todayIso();
  /** Weekdays (0 = Sunday … 6 = Saturday) left out of the range, e.g. Friday. */
  protected readonly skip = signal<ReadonlySet<number>>(new Set());
  /** Multi-day with a different amount per date; blank or 0 means "no entry that day". */
  protected readonly perDay = signal(false);
  protected dayAmounts: Record<string, number | null> = {};
  /** Optional note per date; an empty one falls back to the main note. */
  protected dayNotes: Record<string, string> = {};
  /** Weekday buttons in Bangladesh order (Saturday first), labelled in the current language. */
  protected readonly weekdays = computed(() => {
    const fmt = new Intl.DateTimeFormat(this.i18n.locale(), { weekday: 'short' });
    // 1 Nov 2026 is a Sunday, so 1 + day gives a date on that weekday.
    return [6, 0, 1, 2, 3, 4, 5].map((day) => ({ day, label: fmt.format(new Date(2026, 10, 1 + day)) }));
  });

  /** Active items, plus whatever an existing entry already points at (even if since deactivated). */
  protected readonly accounts = computed(() => {
    const e = this.existing();
    return this.allAccounts().filter((a) => a.isActive || a.id === e?.accountId || a.id === e?.toAccountId);
  });
  protected readonly categories = computed(() => {
    const e = this.existing();
    const wanted = this.type() === 'Income' ? 'Income' : 'Expense';
    return this.allCategories().filter((c) => c.type === wanted && (c.isActive || c.id === e?.categoryId));
  });
  protected readonly activeMembers = computed(() => {
    const e = this.existing();
    return this.members().filter((m) => m.isActive || m.id === e?.memberId);
  });

  protected readonly canModify = computed(() => {
    const e = this.existing();
    return !e || this.auth.isAdmin() || e.createdById === this.auth.user()?.id;
  });

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : null;
    this.id.set(id);

    const typeParam = this.route.snapshot.queryParamMap.get('type') as TransactionType | null;
    if (typeParam && this.types.includes(typeParam)) {
      this.type.set(typeParam);
      this.mode.set('single');
    }

    const tx$: Observable<Transaction | null> = id ? this.api.transaction(id) : of(null);
    forkJoin([this.api.accounts(), this.api.categories(), this.api.users(), tx$]).subscribe({
      next: ([accounts, categories, users, tx]) => {
        this.allAccounts.set(accounts);
        this.allCategories.set(categories);
        this.members.set(users);
        if (tx) this.fill(tx);
        else this.setDefaults();
        this.ready.set(true);
      },
      error: (e) => {
        this.error.set(this.i18n.error(e));
        this.ready.set(true);
      },
    });
  }

  private fill(tx: Transaction): void {
    this.existing.set(tx);
    this.type.set(tx.type);
    this.categoryId.set(tx.categoryId);
    this.form = {
      amount: tx.amount,
      date: tx.date,
      accountId: tx.accountId,
      toAccountId: tx.toAccountId,
      memberId: tx.memberId,
      note: tx.note ?? '',
    };
  }

  private setDefaults(): void {
    const active = this.accounts();
    const last = Number(storageGet(LAST_ACCOUNT_KEY));
    this.form.accountId = active.find((a) => a.id === last)?.id ?? active[0]?.id ?? null;
    this.form.memberId = this.auth.user()?.id ?? null;
    this.rows.set([this.newRow()]);
  }

  // ---------- Batch mode: one date, many entries, one Save ----------

  private newRow(copyFrom?: BatchRow): BatchRow {
    return {
      key: this.nextRowKey++,
      type: copyFrom?.type ?? 'Expense',
      amount: null,
      accountId: copyFrom?.accountId ?? this.form.accountId,
      toAccountId: null,
      categoryId: null,
      memberId: copyFrom ? copyFrom.memberId : this.form.memberId,
      note: '',
    };
  }

  /** New rows reuse the previous row's type, account and member, which usually stay the same. */
  protected addRow(): void {
    const rows = this.rows();
    this.rows.set([...rows, this.newRow(rows[rows.length - 1])]);
  }

  protected removeRow(key: number): void {
    if (this.rows().length > 1) this.rows.set(this.rows().filter((r) => r.key !== key));
  }

  protected setRowType(row: BatchRow, type: TransactionType): void {
    if (row.type === type) return;
    row.type = type;
    row.categoryId = null;
    row.toAccountId = null;
  }

  protected categoriesFor(type: TransactionType): Category[] {
    const wanted = type === 'Income' ? 'Income' : 'Expense';
    return this.allCategories().filter((c) => c.type === wanted && c.isActive);
  }

  private filledRows(): BatchRow[] {
    return this.rows().filter((r) => (Number(r.amount) || 0) > 0);
  }

  protected batchTotals(): { n: number; expense: number; income: number } {
    const rows = this.filledRows();
    const sum = (t: TransactionType) => rows.filter((r) => r.type === t).reduce((s, r) => s + Number(r.amount), 0);
    return { n: rows.length, expense: sum('Expense'), income: sum('Income') };
  }

  protected saveBatch(): void {
    if (this.busy()) return;
    const rows = this.rows();
    if (!this.batchDate) return this.error.set(this.i18n.t('err.validation'));
    if (!this.filledRows().length) return this.error.set(this.i18n.t('tx.batchEmpty'));

    // Rows without an amount are ignored; rows with an amount must be complete.
    for (const [i, r] of rows.entries()) {
      if (!((Number(r.amount) || 0) > 0)) continue;
      const problem = !r.accountId
        ? 'err.ACCOUNT_REQUIRED'
        : r.type === 'Transfer'
          ? !r.toAccountId || r.toAccountId === r.accountId ? 'err.TO_ACCOUNT_INVALID' : null
          : !r.categoryId ? 'err.CATEGORY_REQUIRED' : null;
      if (problem) return this.error.set(`${this.i18n.t('tx.rowError', { n: i + 1 })}: ${this.i18n.t(problem)}`);
    }

    const bodies: TransactionSave[] = this.filledRows().map((r) => ({
      type: r.type,
      amount: Number(r.amount),
      date: this.batchDate,
      accountId: r.accountId!,
      toAccountId: r.type === 'Transfer' ? r.toAccountId : null,
      categoryId: r.type === 'Transfer' ? null : r.categoryId,
      memberId: r.memberId,
      note: r.note.trim() || null,
    }));

    this.busy.set(true);
    this.error.set('');
    this.api.createTransactions(bodies).subscribe({
      next: () => {
        storageSet(LAST_ACCOUNT_KEY, String(bodies[bodies.length - 1].accountId));
        this.goBack();
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(this.i18n.error(e));
      },
    });
  }

  protected setMode(mode: 'batch' | 'single'): void {
    this.mode.set(mode);
    this.error.set('');
  }

  protected setMultiDay(on: boolean): void {
    this.multiDay.set(on);
    this.error.set('');
    if (on && this.toDate < this.form.date) this.toDate = this.form.date;
  }

  protected setPerDay(on: boolean): void {
    this.perDay.set(on);
    this.error.set('');
    if (on) this.fillEmpty();
  }

  /** Puts the main amount into every day of the range. */
  protected fillAll(): void {
    if (!this.form.amount) return;
    for (const d of this.rangeDates()) this.dayAmounts[d] = this.form.amount;
  }

  /** Puts the main amount only into days that have no amount yet. */
  private fillEmpty(): void {
    if (!this.form.amount) return;
    for (const d of this.rangeDates()) if (this.dayAmounts[d] == null) this.dayAmounts[d] = this.form.amount;
  }

  /** Days in the range that have an amount, with that amount. */
  protected perDayEntries(): { date: string; amount: number; note: string | null }[] {
    return this.rangeDates()
      .map((date) => ({ date, amount: Number(this.dayAmounts[date]) || 0, note: this.dayNotes[date]?.trim() || null }))
      .filter((x) => x.amount > 0);
  }

  protected hasAmount(date: string): boolean {
    return (Number(this.dayAmounts[date]) || 0) > 0;
  }

  protected perDayTotal(): number {
    return this.perDayEntries().reduce((sum, x) => sum + x.amount, 0);
  }

  /** "Sat, 1 Nov" in the current language. */
  protected dayLabel(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(this.i18n.locale(), { weekday: 'short', day: 'numeric', month: 'short' }).format(
      new Date(y, m - 1, d),
    );
  }

  protected toggleSkip(day: number): void {
    const next = new Set(this.skip());
    if (next.has(day)) next.delete(day);
    else next.add(day);
    this.skip.set(next);
  }

  /** Every date (yyyy-MM-dd) from the start to the end date, minus skipped weekdays. Capped to avoid runaway loops. */
  protected rangeDates(): string[] {
    const [fy, fm, fd] = this.form.date.split('-').map(Number);
    const [ty, tm, td] = (this.toDate || '').split('-').map(Number);
    if (!fy || !ty) return [];
    const end = new Date(ty, tm - 1, td);
    const dates: string[] = [];
    for (let d = new Date(fy, fm - 1, fd), i = 0; d <= end && i < 400; d.setDate(d.getDate() + 1), i++) {
      if (!this.skip().has(d.getDay())) dates.push(toIso(d));
    }
    return dates;
  }

  protected setType(t: TransactionType): void {
    if (t === this.type()) return;
    this.type.set(t);
    this.categoryId.set(null);
    this.error.set('');
  }

  protected save(): void {
    if (this.busy() || !this.canModify()) return;
    const f = this.form;
    const type = this.type();

    const perDay = !this.id() && this.multiDay() && this.perDay();
    if (!perDay && (!f.amount || f.amount <= 0)) return this.error.set(this.i18n.t('err.validation'));
    if (!f.accountId) return this.error.set(this.i18n.t('err.ACCOUNT_REQUIRED'));
    if (type === 'Transfer' && (!f.toAccountId || f.toAccountId === f.accountId))
      return this.error.set(this.i18n.t('err.TO_ACCOUNT_INVALID'));
    if (type !== 'Transfer' && !this.categoryId()) return this.error.set(this.i18n.t('err.CATEGORY_REQUIRED'));

    const body: TransactionSave = {
      type,
      amount: f.amount ?? 0,
      date: f.date,
      accountId: f.accountId,
      toAccountId: type === 'Transfer' ? f.toAccountId : null,
      categoryId: type === 'Transfer' ? null : this.categoryId(),
      memberId: f.memberId,
      note: f.note.trim() || null,
    };

    const id = this.id();
    let req$: Observable<unknown>;
    if (!id && this.multiDay()) {
      if (this.toDate < f.date) return this.error.set(this.i18n.t('tx.badRange'));
      const days = perDay
        ? this.perDayEntries()
        : this.rangeDates().map((date) => ({ date, amount: body.amount, note: null }));
      if (!days.length) return this.error.set(this.i18n.t(perDay ? 'tx.noAmounts' : 'tx.noDays'));
      if (days.length > MAX_DAYS) return this.error.set(this.i18n.t('tx.tooManyDays', { n: MAX_DAYS }));
      // A day's own note wins; otherwise the main note is used.
      req$ = this.api.createTransactions(
        days.map(({ date, amount, note }) => ({ ...body, date, amount, note: note ?? body.note })),
      );
    } else {
      req$ = id ? this.api.updateTransaction(id, body) : this.api.createTransaction(body);
    }

    this.busy.set(true);
    this.error.set('');
    req$.subscribe({
      next: () => {
        storageSet(LAST_ACCOUNT_KEY, String(body.accountId));
        this.goBack();
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(this.i18n.error(e));
      },
    });
  }

  protected remove(): void {
    const id = this.id();
    if (!id || this.busy() || !confirm(this.i18n.t('tx.confirmDelete'))) return;
    this.busy.set(true);
    this.api.deleteTransaction(id).subscribe({
      next: () => this.goBack(),
      error: (e) => {
        this.busy.set(false);
        this.error.set(this.i18n.error(e));
      },
    });
  }

  protected goBack(): void {
    // Return to wherever the user came from inside the app; otherwise to the list.
    if (this.router.lastSuccessfulNavigation?.previousNavigation) this.location.back();
    else this.router.navigate(['/transactions']);
  }
}
