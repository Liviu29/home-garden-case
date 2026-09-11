import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';

/** Friendly 404: deep-link misses get a page, not a toast. */
@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState, RouterLink, MatButtonModule],
  template: `
    <div class="wrap">
      <app-empty-state
        [headingLevel]="1"
        title="This patch is empty"
        message="The page you're looking for doesn't exist — it may have been moved or deleted."
      >
        <a matButton="filled" routerLink="/" class="press-feedback">Back to the garden</a>
      </app-empty-state>
    </div>
  `,
  styles: `
    .wrap {
      min-height: 100dvh;
      display: grid;
      place-items: center;
    }
  `,
})
export class NotFound {}
