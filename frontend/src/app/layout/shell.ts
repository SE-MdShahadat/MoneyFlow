import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { APP_INFO } from '../core/app-info';
import { AuthService } from '../core/auth.service';
import { I18nService, TPipe } from '../core/i18n/i18n.service';
import { Icon, ThemeToggle } from '../shared/ui';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, ThemeToggle, TPipe],
  templateUrl: './shell.html',
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  protected readonly sideNav: NavItem[] = [
    { path: '/dashboard', label: 'nav.dashboard', icon: 'home' },
    { path: '/transactions', label: 'nav.transactions', icon: 'list' },
    { path: '/accounts', label: 'nav.accounts', icon: 'wallet' },
    { path: '/dues', label: 'nav.dues', icon: 'swap' },
    { path: '/projects', label: 'nav.projects', icon: 'project' },
    { path: '/reports', label: 'nav.reports', icon: 'report' },
    { path: '/categories', label: 'nav.categories', icon: 'tag' },
    { path: '/members', label: 'nav.members', icon: 'users' },
    { path: '/settings', label: 'nav.settings', icon: 'settings' },
  ];

  /** Label for the language button: shows the language you would switch to. */
  protected readonly otherLang = computed(() => (this.i18n.lang() === 'bn' ? 'English' : 'বাংলা'));
  /** Short label for the round language button (same size as the theme button). */
  protected readonly otherLangShort = computed(() => (this.i18n.lang() === 'bn' ? 'EN' : 'বাং'));
  /** © 2026 MoneyFlow · Developed by PeopleSync Technologies Ltd. · v1.0.0 (same line as FuelSync). */
  protected readonly footer = computed(
    () => `© ${APP_INFO.year} ${APP_INFO.name} · ${this.i18n.t('app.developedBy')} ${APP_INFO.developer} · v${APP_INFO.version}`,
  );
  protected readonly initial =computed(() => (this.auth.user()?.name ?? '?').trim().charAt(0).toUpperCase());
}
