import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { I18N_PIPES, I18nService } from '../../core/i18n/i18n.service';
import { Icon } from '../../shared/ui';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, RouterLink, Icon, ...I18N_PIPES],
  templateUrl: './settings.html',
})
export class SettingsPage {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  protected pw = { current: '', next: '' };
  protected readonly busy = signal(false);
  protected readonly pwError = signal('');
  protected readonly pwOk = signal(false);

  protected async changePassword(): Promise<void> {
    if (this.busy()) return;
    this.pwOk.set(false);
    if (!this.pw.current || this.pw.next.length < 6) return this.pwError.set(this.i18n.t('hint.minPassword'));

    this.busy.set(true);
    this.pwError.set('');
    try {
      await this.auth.changePassword(this.pw.current, this.pw.next);
      this.pwOk.set(true);
      this.pw = { current: '', next: '' };
    } catch (e) {
      this.pwError.set(this.i18n.error(e));
    } finally {
      this.busy.set(false);
    }
  }
}
