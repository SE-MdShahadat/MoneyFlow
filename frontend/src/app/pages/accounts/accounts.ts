import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18N_PIPES, I18nService } from '../../core/i18n/i18n.service';
import { ACCOUNT_ICONS, ACCOUNT_TYPES, Account, AccountSave } from '../../core/models';
import { Icon, Modal } from '../../shared/ui';

@Component({
  selector: 'app-accounts',
  imports: [FormsModule, Icon, Modal, ...I18N_PIPES],
  templateUrl: './accounts.html',
})
export class AccountsPage {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  protected readonly types = ACCOUNT_TYPES;
  protected readonly icons = ACCOUNT_ICONS;

  protected readonly accounts = signal<Account[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal('');
  protected readonly total = computed(() =>
    this.accounts()
      .filter((a) => a.isActive)
      .reduce((sum, a) => sum + a.balance, 0),
  );

  // Editor
  protected readonly editing = signal<Account | 'new' | null>(null);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected form: AccountSave = this.blank();

  constructor() {
    this.load();
  }

  private blank(): AccountSave {
    return { name: '', type: 'Cash', openingBalance: 0, note: null, isActive: true };
  }

  private load(): void {
    this.api.accounts().subscribe({
      next: (list) => {
        this.accounts.set(list);
        this.loaded.set(true);
      },
      error: (e) => {
        this.error.set(this.i18n.error(e));
        this.loaded.set(true);
      },
    });
  }

  protected open(account: Account | 'new'): void {
    if (!this.auth.isAdmin()) return;
    this.form =
      account === 'new'
        ? this.blank()
        : { name: account.name, type: account.type, openingBalance: account.openingBalance, note: account.note, isActive: account.isActive };
    this.formError.set('');
    this.editing.set(account);
  }

  protected save(): void {
    const target = this.editing();
    if (!target || this.busy()) return;
    if (!this.form.name.trim()) return this.formError.set(this.i18n.t('err.validation'));

    const body: AccountSave = { ...this.form, openingBalance: Number(this.form.openingBalance) || 0 };
    this.busy.set(true);
    const req$ = target === 'new' ? this.api.createAccount(body) : this.api.updateAccount(target.id, body);
    req$.subscribe({
      next: () => this.done(),
      error: (e) => this.fail(e),
    });
  }

  protected remove(): void {
    const target = this.editing();
    if (!target || target === 'new' || this.busy() || !confirm(this.i18n.t('acc.confirmDelete'))) return;
    this.busy.set(true);
    this.api.deleteAccount(target.id).subscribe({
      next: () => this.done(),
      error: (e) => this.fail(e),
    });
  }

  private done(): void {
    this.busy.set(false);
    this.editing.set(null);
    this.load();
  }

  private fail(e: unknown): void {
    this.busy.set(false);
    this.formError.set(this.i18n.error(e));
  }
}
