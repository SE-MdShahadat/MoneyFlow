import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18N_PIPES, I18nService } from '../../core/i18n/i18n.service';
import { ACCOUNT_ICONS, Dashboard, Period } from '../../core/models';
import { MonthPicker, TxItem, currentPeriod } from '../../shared/ui';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, MonthPicker, TxItem, ...I18N_PIPES],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPage {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  protected readonly accountIcons = ACCOUNT_ICONS;

  protected readonly period = signal<Period>(currentPeriod());
  protected readonly data = signal<Dashboard | null>(null);
  protected readonly error = signal('');

  protected readonly maxCategory = computed(() => Math.max(1, ...(this.data()?.expenseByCategory.map((c) => c.amount) ?? [])));
  protected readonly maxMember = computed(() => Math.max(1, ...(this.data()?.expenseByMember.map((m) => m.amount) ?? [])));
  protected readonly maxTrend = computed(() =>
    Math.max(1, ...(this.data()?.trend.flatMap((t) => [t.income, t.expense]) ?? [])),
  );
  /** Last 6 months, newest month first (left). */
  protected readonly trendNewestFirst = computed(() => [...(this.data()?.trend ?? [])].reverse());
  protected readonly savingsRate = computed(() => {
    const d = this.data();
    return d && d.income > 0 ? Math.round((d.net / d.income) * 100) : null;
  });

  constructor() {
    effect(() => {
      const p = this.period();
      untracked(() => this.load(p));
    });
  }

  private load(p: Period): void {
    this.error.set('');
    this.api.dashboard(p.year, p.month).subscribe({
      next: (d) => this.data.set(d),
      error: (e) => this.error.set(this.i18n.error(e)),
    });
  }

  protected pct(value: number, max: number): number {
    return Math.max(2, Math.round((value / max) * 100));
  }
}
