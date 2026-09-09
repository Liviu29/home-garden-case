import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Consistent page heading with optional subtitle and projected actions. */
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="header anim-fade-up">
      <div class="titles">
        <h1>{{ title() }}</h1>
        @if (subtitle()) {
          <p class="subtitle">{{ subtitle() }}</p>
        }
      </div>
      <div class="actions">
        <ng-content />
      </div>
    </header>
  `,
  styles: `
    .header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--sp-4);
      flex-wrap: wrap;
      margin-block: var(--sp-8) var(--sp-6);
    }

    .subtitle {
      color: var(--text-2);
      margin-top: var(--sp-1);
    }

    .actions {
      display: flex;
      gap: var(--sp-2);
    }
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
