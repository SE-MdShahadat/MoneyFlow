import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_INFO } from '../../core/app-info';
import { I18nService, TPipe } from '../../core/i18n/i18n.service';
import { Icon, ThemeToggle } from '../../shared/ui';

/** Public front page for people who are not signed in (same layout as FuelSync's welcome page, without pricing). */
@Component({
  selector: 'app-welcome',
  imports: [RouterLink, Icon, ThemeToggle, TPipe],
  templateUrl: './welcome.html',
  styleUrl: './welcome.scss',
})
export class WelcomePage {
  protected readonly i18n = inject(I18nService);
  protected readonly app = APP_INFO;
  protected readonly otherLang = computed(() => (this.i18n.lang() === 'bn' ? 'English' : 'বাংলা'));
  protected readonly otherLangShort = computed(() => (this.i18n.lang() === 'bn' ? 'EN' : 'বাং'));

  protected readonly features = [
    { icon: 'list', title: 'wel.f1Title', text: 'wel.f1Text' },
    { icon: 'wallet', title: 'wel.f2Title', text: 'wel.f2Text' },
    { icon: 'swap', title: 'wel.f3Title', text: 'wel.f3Text' },
    { icon: 'project', title: 'wel.f4Title', text: 'wel.f4Text' },
    { icon: 'report', title: 'wel.f5Title', text: 'wel.f5Text' },
    { icon: 'users', title: 'wel.f6Title', text: 'wel.f6Text' },
  ];

  protected readonly steps = ['wel.s1', 'wel.s2', 'wel.s3'];

  /** In-page jump; a plain href="#id" would be read as a route by the hash router. */
  protected scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
