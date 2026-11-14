import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18N_PIPES, I18nService } from '../../core/i18n/i18n.service';
import { Icon } from '../../shared/ui';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, RouterLink, Icon, ...I18N_PIPES],
  templateUrl: './settings.html',
})
export class SettingsPage {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  protected pw = { current: '', next: '' };
  protected readonly busy = signal(false);
  protected readonly pwError = signal('');
  protected readonly pwOk = signal(false);

  protected changePassword(): void {
    if (this.busy()) return;
    this.pwOk.set(false);
    if (!this.pw.current || this.pw.next.length < 6) return this.pwError.set(this.i18n.t('hint.minPassword'));

    this.busy.set(true);
    this.pwError.set('');
    this.api.changePassword({ currentPassword: this.pw.current, newPassword: this.pw.next }).subscribe({
      next: () => {
        this.busy.set(false);
        this.pwOk.set(true);
        this.pw = { current: '', next: '' };
      },
      error: (e) => {
        this.busy.set(false);
        this.pwError.set(this.i18n.error(e));
      },
    });
  }
}
