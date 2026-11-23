import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { I18N_PIPES, I18nService } from '../../core/i18n/i18n.service';
import { Project, ProjectSave } from '../../core/models';
import { Modal } from '../../shared/ui';

/** Add / edit / delete a project in a modal. Used by the project list and the project page. */
@Component({
  selector: 'app-project-editor',
  imports: [FormsModule, Modal, ...I18N_PIPES],
  template: `
    <app-modal [open]="target() !== null" [title]="(target() === 'new' ? 'proj.add' : 'proj.edit') | t" (closed)="closed.emit()">
      <form (ngSubmit)="save()">
        <div class="field">
          <label for="proj-name">{{ 'proj.name' | t }}</label>
          <input id="proj-name" name="name" [(ngModel)]="form.name" required maxlength="100" [placeholder]="'proj.namePh' | t" />
        </div>
        <div class="field">
          <label for="proj-budget">{{ 'proj.budget' | t }} (৳) <span class="muted">({{ 'field.optional' | t }})</span></label>
          <input id="proj-budget" name="budget" type="number" inputmode="decimal" min="0" step="0.01" [(ngModel)]="form.budget" />
        </div>
        <div class="field">
          <label for="proj-note">{{ 'field.note' | t }} <span class="muted">({{ 'field.optional' | t }})</span></label>
          <input id="proj-note" name="note" [(ngModel)]="form.note" maxlength="500" />
        </div>
        @if (target() !== 'new') {
          <label class="check"><input type="checkbox" name="isDone" [(ngModel)]="form.isDone" /> {{ 'proj.doneLabel' | t }}</label>
        }

        @if (error()) {
          <div class="alert alert-error" role="alert">{{ error() }}</div>
        }
        <div class="actions">
          @if (target() !== 'new') {
            <button type="button" class="btn btn-danger" (click)="remove()" [disabled]="busy()">{{ 'action.delete' | t }}</button>
          }
          <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ 'action.save' | t }}</button>
        </div>
      </form>
    </app-modal>
  `,
})
export class ProjectEditor {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);

  /** null = closed, 'new' = create, a project = edit it. */
  readonly target = input<Project | 'new' | null>(null);
  readonly closed = output<void>();
  /** Emitted after a save; `deleted` is true when the project was removed. */
  readonly saved = output<{ deleted: boolean }>();

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected form: ProjectSave = { name: '', budget: null, note: null, isDone: false };

  constructor() {
    effect(() => {
      const t = this.target();
      this.error.set('');
      this.busy.set(false);
      this.form =
        t && t !== 'new'
          ? { name: t.name, budget: t.budget, note: t.note, isDone: t.isDone }
          : { name: '', budget: null, note: null, isDone: false };
    });
  }

  protected save(): void {
    const t = this.target();
    if (!t || this.busy()) return;
    if (!this.form.name.trim()) return this.error.set(this.i18n.t('err.validation'));
    this.busy.set(true);
    const req$ = t === 'new' ? this.api.createProject(this.form) : this.api.updateProject(t.id, this.form);
    req$.subscribe({ next: () => this.saved.emit({ deleted: false }), error: (e) => this.fail(e) });
  }

  protected remove(): void {
    const t = this.target();
    if (!t || t === 'new' || this.busy()) return;
    if (t.entries > 0) return this.error.set(this.i18n.t('err.PROJECT_IN_USE'));
    if (!confirm(this.i18n.t('proj.confirmDelete'))) return;
    this.busy.set(true);
    this.api.deleteProject(t.id).subscribe({ next: () => this.saved.emit({ deleted: true }), error: (e) => this.fail(e) });
  }

  private fail(e: unknown): void {
    this.busy.set(false);
    this.error.set(this.i18n.error(e));
  }
}
