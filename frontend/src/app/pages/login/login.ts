import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { I18nService, TPipe } from '../../core/i18n/i18n.service';
import { User } from '../../core/models';
import { ThemeToggle } from '../../shared/ui';

@Component({
  selector: 'app-login',
  imports: [FormsModule, TPipe, ThemeToggle],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService);

  protected readonly mode = signal<'login' | 'signup'>('login');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly pending = signal(false);
  protected readonly otherLang = computed(() => (this.i18n.lang() === 'bn' ? 'English' : 'বাংলা'));
  /** Short label for the round language button (same size as the theme button). */
  protected readonly otherLangShort = computed(() => (this.i18n.lang() === 'bn' ? 'EN' : 'বাং'));

  protected form = { name: '', email: '', password: '' };

  protected setMode(m: 'login' | 'signup'): void {
    this.mode.set(m);
    this.error.set('');
    this.pending.set(false);
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    this.error.set('');
    this.pending.set(false);
    this.busy.set(true);
    try {
      const user: User | null =
        this.mode() === 'signup'
          ? await this.auth.signUp(this.form.name, this.form.email, this.form.password)
          : await this.auth.signIn(this.form.email, this.form.password);

      if (user?.isActive) {
        await this.router.navigate(['/dashboard']);
        return;
      }
      // Signed in, but an admin has not approved this account yet.
      await this.auth.signOutQuietly();
      this.pending.set(true);
      this.mode.set('login');
    } catch (e) {
      this.error.set(this.i18n.error(e));
    } finally {
      this.busy.set(false);
    }
  }
}
