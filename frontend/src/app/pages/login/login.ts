import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18nService, TPipe } from '../../core/i18n/i18n.service';
import { LoginResponse } from '../../core/models';
import { Icon } from '../../shared/ui';
import { Observable } from 'rxjs';
import { apiBaseUrl, isStaticHost, setApiUrlOverride } from '../../core/config';

@Component({
  selector: 'app-login',
  imports: [FormsModule, TPipe, Icon],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService);

  protected readonly mode = signal<'loading' | 'login' | 'setup'>('loading');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly otherLang = computed(() => (this.i18n.lang() === 'bn' ? 'English' : 'বাংলা'));

  protected form = { name: '', username: '', password: '' };

  // Server address (needed when the UI is hosted on GitHub Pages and the API runs elsewhere).
  protected readonly showServer = signal(isStaticHost() && !apiBaseUrl());
  protected serverUrl = apiBaseUrl();

  ngOnInit(): void {
    // On a static host with no server address yet there is nothing to ask; just show the address box.
    if (this.showServer()) this.mode.set('login');
    else this.checkStatus();
  }

  private checkStatus(): void {
    this.mode.set('loading');
    this.error.set('');
    this.api.authStatus().subscribe({
      next: (s) => this.mode.set(s.needsSetup ? 'setup' : 'login'),
      error: (e) => {
        this.mode.set('login');
        this.showServer.set(true);
        this.error.set(this.i18n.error(e));
      },
    });
  }

  protected saveServer(): void {
    setApiUrlOverride(this.serverUrl);
    this.serverUrl = apiBaseUrl();
    this.showServer.set(false);
    this.checkStatus();
  }

  submit(): void {
    if (this.busy()) return;
    this.error.set('');
    this.busy.set(true);

    const req: Observable<LoginResponse> =
      this.mode() === 'setup'
        ? this.api.setup({ name: this.form.name, username: this.form.username, password: this.form.password })
        : this.api.login({ username: this.form.username, password: this.form.password });

    req.subscribe({
      next: (res) => {
        this.auth.setSession(res);
        this.router.navigate(['/dashboard']);
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(this.i18n.error(e));
        if (e?.error?.code === 'SETUP_DONE') this.mode.set('login');
      },
    });
  }
}
