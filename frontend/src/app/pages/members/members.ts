import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18N_PIPES, I18nService } from '../../core/i18n/i18n.service';
import { User, UserRole, UserSave } from '../../core/models';
import { Modal } from '../../shared/ui';

/**
 * Family members. People join by creating an account themselves (login page);
 * an admin approves them here and can change their role.
 */
@Component({
  selector: 'app-members',
  imports: [FormsModule, Modal, ...I18N_PIPES],
  templateUrl: './members.html',
})
export class MembersPage {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  protected readonly roles: UserRole[] = ['Member', 'Admin'];

  protected readonly members = signal<User[]>([]);
  protected readonly error = signal('');
  protected readonly pendingCount = computed(() => this.members().filter((m) => !m.isActive).length);

  protected readonly editing = signal<User | null>(null);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected form: UserSave = { name: '', role: 'Member', relation: null, isActive: true };

  constructor() {
    this.load();
  }

  private load(): void {
    this.api.users().subscribe({
      next: (list) => this.members.set(list),
      error: (e) => this.error.set(this.i18n.error(e)),
    });
  }

  protected open(u: User): void {
    if (!this.auth.isAdmin()) return;
    this.form = { name: u.name, role: u.role, relation: u.relation, isActive: u.isActive };
    this.formError.set('');
    this.editing.set(u);
  }

  protected approve(u: User, event: Event): void {
    event.stopPropagation();
    this.saveMember(u.id, { name: u.name, role: u.role, relation: u.relation, isActive: true });
  }

  protected save(): void {
    const target = this.editing();
    if (!target) return;
    if (!this.form.name.trim()) return this.formError.set(this.i18n.t('err.validation'));
    this.saveMember(target.id, { ...this.form, relation: this.form.relation?.trim() || null });
  }

  private saveMember(id: string, body: UserSave): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.updateUser(id, body).subscribe({
      next: (saved) => {
        if (saved.id === this.auth.user()?.id) this.auth.updateUser(saved);
        this.busy.set(false);
        this.editing.set(null);
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        const msg = this.i18n.error(e);
        if (this.editing()) this.formError.set(msg);
        else this.error.set(msg);
      },
    });
  }
}
