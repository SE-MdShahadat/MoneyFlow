import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { I18N_PIPES, I18nService } from '../../core/i18n/i18n.service';
import { Project, Transaction } from '../../core/models';
import { XlsxCell, XlsxStyle, downloadXlsx } from '../../core/xlsx';
import { Icon, TxItem } from '../../shared/ui';
import { ProjectEditor } from './project-editor';

/** Share of the budget spent, rounded (0 when there is no budget). */
export function budgetPct(p: Pick<Project, 'budget' | 'expense'>): number {
  return p.budget ? Math.round((p.expense / p.budget) * 100) : 0;
}

/** One item (category) of a project's spending, with quantities added up per unit. */
interface ItemTotal {
  key: string;
  icon: string;
  color: string;
  name: string;
  amount: number;
  count: number;
  /** e.g. [{unit: 'পিস', qty: 5000}] — the same item may be bought in different units. */
  qty: { unit: string; qty: number }[];
}

const SHOW_STEP = 30;

@Component({
  selector: 'app-project-detail',
  imports: [RouterLink, Icon, TxItem, ProjectEditor, ...I18N_PIPES],
  templateUrl: './project-detail.html',
  styleUrl: './projects.scss',
})
export class ProjectDetailPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService);
  protected readonly pct = budgetPct;

  protected readonly project = signal<Project | null>(null);
  /** Every entry of the project, oldest first. */
  protected readonly entries = signal<Transaction[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal('');
  protected readonly editing = signal<Project | null>(null);
  protected readonly shown = signal(SHOW_STEP);

  protected readonly newestFirst = computed(() => [...this.entries()].reverse());

  protected readonly items = computed<ItemTotal[]>(() => {
    const map = new Map<string, ItemTotal>();
    for (const t of this.entries()) {
      if (t.type !== 'Expense') continue;
      const key = String(t.categoryId ?? 0);
      let it = map.get(key);
      if (!it) {
        it = { key, icon: t.categoryIcon ?? '📦', color: t.categoryColor ?? '#64748b', name: this.i18n.catName(t), amount: 0, count: 0, qty: [] };
        map.set(key, it);
      }
      it.amount += t.amount;
      it.count++;
      if (t.quantity) {
        const unit = t.unit ?? '';
        const q = it.qty.find((x) => x.unit === unit);
        if (q) q.qty += t.quantity;
        else it.qty.push({ unit, qty: t.quantity });
      }
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  });
  protected readonly maxItem = computed(() => Math.max(1, ...this.items().map((i) => i.amount)));

  /** Spending per month, oldest first. */
  protected readonly months = computed(() => {
    const map = new Map<string, number>();
    for (const t of this.entries()) {
      if (t.type !== 'Expense') continue;
      const key = t.date.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + t.amount);
    }
    return [...map.entries()].map(([key, amount]) => {
      const [y, m] = key.split('-').map(Number);
      return { key, label: this.i18n.monthName(y, m), amount };
    });
  });

  ngOnInit(): void {
    this.load();
  }

  private id(): number {
    return Number(this.route.snapshot.paramMap.get('id'));
  }

  private load(): void {
    const id = this.id();
    forkJoin([
      this.api.project(id),
      this.api.reportTransactions({ from: '1900-01-01', to: '9999-12-31', projectId: id }),
    ]).subscribe({
      next: ([p, list]) => {
        this.project.set(p);
        this.entries.set(list);
        this.loaded.set(true);
      },
      error: (e) => {
        this.error.set(this.i18n.error(e));
        this.loaded.set(true);
      },
    });
  }

  protected onSaved(e: { deleted: boolean }): void {
    this.editing.set(null);
    if (e.deleted) this.router.navigate(['/projects']);
    else this.load();
  }

  protected showMore(): void {
    this.shown.update((n) => n + SHOW_STEP);
  }

  protected qtyText(q: { unit: string; qty: number }[]): string {
    return q.map((x) => `${this.i18n.number(x.qty)} ${x.unit}`.trim()).join(' + ');
  }

  /** Average price per unit, only when the item was bought in a single unit. */
  protected avgRate(it: ItemTotal): string {
    if (it.qty.length !== 1) return '';
    const withQty = this.entries().filter(
      (t) => t.type === 'Expense' && String(t.categoryId ?? 0) === it.key && t.quantity && (t.unit ?? '') === it.qty[0].unit,
    );
    const amount = withQty.reduce((s, t) => s + t.amount, 0);
    const qty = it.qty[0].qty;
    return qty ? this.i18n.t('proj.rate', { rate: this.i18n.money(Math.round((amount / qty) * 100) / 100), unit: it.qty[0].unit || '' }) : '';
  }

  protected exportExcel(): void {
    const p = this.project();
    if (!p) return;
    const t = (k: string) => this.i18n.t(k);
    const round = (n: number) => Math.round(n * 100) / 100;
    const head = (labels: string[]): XlsxCell[] => labels.map((value) => ({ value, style: XlsxStyle.header }));
    const rows: XlsxCell[][] = [
      [{ value: t('app.name'), style: XlsxStyle.title }],
      [{ value: `${t('nav.projects')}: ${p.name}`, style: XlsxStyle.bold }],
      [],
      [{ value: t('proj.spent'), style: XlsxStyle.bold }, { value: round(p.expense), style: XlsxStyle.boldNumber }],
    ];
    if (p.budget) {
      rows.push(
        [{ value: t('proj.budget'), style: XlsxStyle.bold }, { value: round(p.budget), style: XlsxStyle.boldNumber }],
        [{ value: t('proj.remaining'), style: XlsxStyle.bold }, { value: round(p.budget - p.expense), style: XlsxStyle.boldNumber }],
      );
    }
    if (p.income) rows.push([{ value: t('type.Income'), style: XlsxStyle.bold }, { value: round(p.income), style: XlsxStyle.boldNumber }]);

    rows.push([], [{ value: t('proj.byItem'), style: XlsxStyle.bold }], head([t('field.category'), t('field.quantity'), t('field.amount')]));
    for (const it of this.items()) {
      rows.push([{ value: it.name }, { value: this.qtyText(it.qty) }, { value: round(it.amount), style: XlsxStyle.number }]);
    }

    rows.push(
      [],
      [{ value: t('proj.allEntries'), style: XlsxStyle.bold }],
      head([t('field.date'), t('field.category'), t('field.quantity'), t('field.unit'), t('field.amount'), t('field.account'), t('field.note'), t('field.member')]),
    );
    for (const e of this.entries()) {
      const sign = e.type === 'Income' ? 1 : -1;
      rows.push([
        { value: this.i18n.date(e.date) },
        { value: this.i18n.catName(e) },
        { value: e.quantity ?? null, style: XlsxStyle.number },
        { value: e.unit ?? '' },
        { value: round(sign * e.amount), style: XlsxStyle.number },
        { value: e.accountName },
        { value: e.note ?? '' },
        { value: e.memberName ?? '' },
      ]);
    }
    downloadXlsx(`MoneyFlow-${p.name.replace(/[\\/:*?"<>|]+/g, '-')}`, {
      name: p.name.slice(0, 31) || 'Project',
      rows,
      widths: [16, 22, 12, 10, 14, 16, 30, 16],
    });
  }
}
