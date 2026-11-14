import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18N_PIPES, I18nService } from '../../core/i18n/i18n.service';
import { User, UserRole } from '../../core/models';
import { Icon, Modal } from '../../shared/ui';

interface MemberForm {
  name: string;
  username: string;
  password: string;
  role: UserRole;
  relation: string;
  isActive: boolean;
}

@Component({
  selector: 'app-members',
  imports: [FormsModule, Icon, Modal, ...I18N_PIPES],
  templateUrl: './members.html',
})
export class MembersPage {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  protected readonly roles: UserRole[] = ['Member', 'Admin'];

  protected readonly members = signal<User[]>([]);
  protected readonly error = signal('');

  protected readonly editing = signal<User | 'new' | null>(null);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected form: MemberForm = this.blank();

  constructor() {
    this.load();
  }

  private blank(): MemberForm {
    return { name: '', username: '', password: '', role: 'Member', relation: '', isActive: true };
  }

  private load(): void {
    this.api.users().subscribe({
      next: (list) => this.members.set(list),
      error: (e) => this.error.set(this.i18n.error(e)),
    });
  }

  protected open(u: User | 'new'): void {
    if (!this.auth.isAdmin()) return;
    this.form =
      u === 'new'
        ? this.blank()
        : { name: u.name, username: u.username, password: '', role: u.role, relation: u.relation ?? '', isActive: u.isActive };
    this.formError.set('');
    this.editing.set(u);
  }

  protected save(): void {
    const target = this.editing();
    if (!target || this.busy()) return;
    const f = this.form;
    const isNew = target === 'new';
    if (!f.name.trim() || (isNew && (!f.username.trim() || f.password.length < 6)) || (!isNew && f.password && f.password.length < 6)) {
      return this.formError.set(this.i18n.t('err.validation'));
    }

    this.busy.set(true);
    const relation = f.relation.trim() || null;
    const req$ = isNew
      ? this.api.createUser({ name: f.name, username: f.username, password: f.password, role: f.role, relation })
      : this.api.updateUser(target.id, {
          name: f.name,
          role: f.role,
          relation,
          isActive: f.isActive,
          newPassword: f.password || null,
        });

    req$.subscribe({
      next: (saved) => {
        if (saved.id === this.auth.user()?.id) this.auth.updateUser(saved);
        this.busy.set(false);
        this.editing.set(null);
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.formError.set(this.i18n.error(e));
      },
    });
  }
}
