import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18N_PIPES, I18nService } from '../../core/i18n/i18n.service';
import { Category, CategorySave, CategoryType } from '../../core/models';
import { Icon, Modal } from '../../shared/ui';

@Component({
  selector: 'app-categories',
  imports: [FormsModule, Icon, Modal, ...I18N_PIPES],
  templateUrl: './categories.html',
})
export class CategoriesPage {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  protected readonly tab = signal<CategoryType>('Expense');
  protected readonly all = signal<Category[]>([]);
  protected readonly error = signal('');
  protected readonly list = computed(() => this.all().filter((c) => c.type === this.tab()));

  protected readonly editing = signal<Category | 'new' | null>(null);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected form: CategorySave = this.blank();

  constructor() {
    this.load();
  }

  private blank(): CategorySave {
    return { nameEn: '', nameBn: '', type: this.tab(), icon: '📦', color: '#64748b', sortOrder: 50, isActive: true };
  }

  private load(): void {
    this.api.categories().subscribe({
      next: (list) => this.all.set(list),
      error: (e) => this.error.set(this.i18n.error(e)),
    });
  }

  protected open(c: Category | 'new'): void {
    if (!this.auth.isAdmin()) return;
    if (c === 'new') {
      this.form = this.blank();
    } else {
      const { id: _id, ...rest } = c;
      this.form = { ...rest };
    }
    this.formError.set('');
    this.editing.set(c);
  }

  protected save(): void {
    const target = this.editing();
    if (!target || this.busy()) return;
    if (!this.form.nameEn.trim() || !this.form.nameBn.trim()) return this.formError.set(this.i18n.t('err.validation'));

    this.busy.set(true);
    const body: CategorySave = { ...this.form, sortOrder: Number(this.form.sortOrder) || 0 };
    const req$ = target === 'new' ? this.api.createCategory(body) : this.api.updateCategory(target.id, body);
    req$.subscribe({ next: () => this.done(), error: (e) => this.fail(e) });
  }

  protected remove(): void {
    const target = this.editing();
    if (!target || target === 'new' || this.busy() || !confirm(this.i18n.t('cat.confirmDelete'))) return;
    this.busy.set(true);
    this.api.deleteCategory(target.id).subscribe({ next: () => this.done(), error: (e) => this.fail(e) });
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
