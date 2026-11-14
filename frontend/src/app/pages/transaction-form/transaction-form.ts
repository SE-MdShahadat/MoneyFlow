import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { storageGet, storageSet, todayIso } from '../../core/config';
import { I18N_PIPES, I18nService } from '../../core/i18n/i18n.service';
import { Account, Category, Transaction, TransactionSave, TransactionType, User } from '../../core/models';
import { Icon } from '../../shared/ui';

const LAST_ACCOUNT_KEY = 'mf.lastAccount';

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
    memberId: null as number | null,
    note: '',
  };

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
    if (typeParam && this.types.includes(typeParam)) this.type.set(typeParam);

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

    if (!f.amount || f.amount <= 0) return this.error.set(this.i18n.t('err.validation'));
    if (!f.accountId) return this.error.set(this.i18n.t('err.ACCOUNT_REQUIRED'));
    if (type === 'Transfer' && (!f.toAccountId || f.toAccountId === f.accountId))
      return this.error.set(this.i18n.t('err.TO_ACCOUNT_INVALID'));
    if (type !== 'Transfer' && !this.categoryId()) return this.error.set(this.i18n.t('err.CATEGORY_REQUIRED'));

    const body: TransactionSave = {
      type,
      amount: f.amount,
      date: f.date,
      accountId: f.accountId,
      toAccountId: type === 'Transfer' ? f.toAccountId : null,
      categoryId: type === 'Transfer' ? null : this.categoryId(),
      memberId: f.memberId,
      note: f.note.trim() || null,
    };

    this.busy.set(true);
    this.error.set('');
    const id = this.id();
    const req$ = id ? this.api.updateTransaction(id, body) : this.api.createTransaction(body);
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
