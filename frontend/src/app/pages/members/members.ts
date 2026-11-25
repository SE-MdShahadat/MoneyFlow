import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18N_PIPES, I18nService } from '../../core/i18n/i18n.service';
import { Family, User, UserRole, UserSave } from '../../core/models';
import { Icon, Modal } from '../../shared/ui';

/**
 * Family members. People join by creating an account themselves (login page);
 * an admin approves them here and can change their role.
 */
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
  protected readonly pendingCount = computed(() => this.members().filter((m) => !m.isActive).length);

  protected readonly editing = signal<User | null>(null);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected form: UserSave = { name: '', role: 'Member', relation: null, isActive: true };

  // Family name and invite code
  protected readonly family = signal<Family | null>(null);
  protected readonly renaming = signal(false);
  protected familyName = '';
  protected readonly copied = signal(false);

  constructor() {
    this.load();
    this.api.family().subscribe({ next: (f) => this.family.set(f), error: () => this.family.set(null) });
  }

  /** Invitation text: the app link plus the code, ready to paste into a message. */
  private inviteText(f: Family): string {
    const link = location.href.split('#')[0];
    return this.i18n.t('fam.inviteText', { family: f.name, link, code: f.inviteCode });
  }

  protected async share(): Promise<void> {
    const f = this.family();
    if (!f) return;
    const text = this.inviteText(f);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Share sheet closed or clipboard blocked: nothing to do.
    }
  }

  protected newCode(): void {
    if (!this.auth.isAdmin() || this.busy() || !confirm(this.i18n.t('fam.confirmNewCode'))) return;
    this.busy.set(true);
    this.api.regenerateInviteCode().subscribe({
      next: (code) => {
        this.busy.set(false);
        const f = this.family();
        if (f) this.family.set({ ...f, inviteCode: code });
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(this.i18n.error(e));
      },
    });
  }

  protected openRename(): void {
    this.familyName = this.family()?.name ?? '';
    this.formError.set('');
    this.renaming.set(true);
  }

  protected saveName(): void {
    const f = this.family();
    const name = this.familyName.trim();
    if (!f || this.busy()) return;
    if (!name) return this.formError.set(this.i18n.t('err.validation'));
    this.busy.set(true);
    this.api.renameFamily(f.id, name).subscribe({
      next: () => {
        this.busy.set(false);
        this.renaming.set(false);
        this.family.set({ ...f, name });
      },
      error: (e) => {
        this.busy.set(false);
        this.formError.set(this.i18n.error(e));
      },
    });
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
