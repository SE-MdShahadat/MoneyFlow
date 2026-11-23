import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { I18N_PIPES, I18nService } from '../../core/i18n/i18n.service';
import { Project } from '../../core/models';
import { Icon } from '../../shared/ui';
import { ProjectEditor } from './project-editor';
import { budgetPct } from './project-detail';

/** All projects (e.g. house construction): running ones with their budget progress, then finished ones. */
@Component({
  selector: 'app-projects',
  imports: [RouterLink, Icon, ProjectEditor, ...I18N_PIPES],
  templateUrl: './projects.html',
  styleUrl: './projects.scss',
})
export class ProjectsPage {
  private readonly api = inject(ApiService);
  protected readonly i18n = inject(I18nService);
  protected readonly pct = budgetPct;

  protected readonly all = signal<Project[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal('');
  protected readonly editing = signal<Project | 'new' | null>(null);

  protected readonly running = computed(() => this.all().filter((p) => !p.isDone));
  protected readonly done = computed(() => this.all().filter((p) => p.isDone));

  constructor() {
    this.load();
  }

  private load(): void {
    this.api.projects().subscribe({
      next: (list) => {
        this.all.set(list);
        this.loaded.set(true);
      },
      error: (e) => {
        this.error.set(this.i18n.error(e));
        this.loaded.set(true);
      },
    });
  }

  protected onSaved(): void {
    this.editing.set(null);
    this.load();
  }
}
