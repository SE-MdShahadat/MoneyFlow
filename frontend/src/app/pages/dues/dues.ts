import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18N_PIPES, I18nService } from '../../core/i18n/i18n.service';
import { Due, DueKind, DueSave } from '../../core/models';
import { Icon, Modal } from '../../shared/ui';

/** Receivable (পাওনা) and payable (দেনা) amounts, one row per person. */
@Component({
  selector: 'app-dues',
  imports: [FormsModule, Icon, Modal, ...I18N_PIPES],
  templateUrl: './dues.html',
})
export class DuesPage {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  protected readonly tab = signal<DueKind>('Receivable');
  protected readonly all = signal<Due[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal('');

  protected readonly list = computed(() => this.all().filter((d) => d.kind === this.tab()));
  protected readonly totalOf = (kind: DueKind) =>
    this.all()
      .filter((d) => d.kind === kind && !d.isSettled)
      .reduce((sum, d) => sum + d.amount, 0);
  protected readonly receivable = computed(() => this.totalOf('Receivable'));
  protected readonly payable = computed(() => this.totalOf('Payable'));

  protected readonly editing = signal<Due | 'new' | null>(null);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected form: DueSave = this.blank();

  constructor() {
    this.load();
  }

  private blank(): DueSave {
    return { kind: this.tab(), person: '', amount: 0, note: null, isSettled: false };
  }

  private load(): void {
    this.api.dues().subscribe({
      next: (list) => {
        this.all.set(list);
        this.loaded.set(true);
      },
      error: (e) => {
        this.error.set(this.i18n.error(e));
        this.loaded.set(true);
      },
    });
  }

  protected canEdit(d: Due): boolean {
    return this.auth.isAdmin() || d.createdById === this.auth.user()?.id;
  }

  protected open(d: Due | 'new'): void {
    if (d !== 'new' && !this.canEdit(d)) return;
    this.form =
      d === 'new'
        ? this.blank()
        : { kind: d.kind, person: d.person, amount: d.amount, note: d.note, isSettled: d.isSettled };
    this.formError.set('');
    this.editing.set(d);
  }

  protected save(): void {
    const target = this.editing();
    if (!target || this.busy()) return;
    if (!this.form.person.trim() || !(Number(this.form.amount) >= 0)) {
      return this.formError.set(this.i18n.t('err.validation'));
    }
    this.busy.set(true);
    const req$ = target === 'new' ? this.api.createDue(this.form) : this.api.updateDue(target.id, this.form);
    req$.subscribe({ next: () => this.done(), error: (e) => this.fail(e) });
  }

  protected remove(): void {
    const target = this.editing();
    if (!target || target === 'new' || this.busy() || !confirm(this.i18n.t('due.confirmDelete'))) return;
    this.busy.set(true);
    this.api.deleteDue(target.id).subscribe({ next: () => this.done(), error: (e) => this.fail(e) });
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
