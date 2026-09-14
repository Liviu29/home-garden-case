import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface ConfirmDialogData {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly destructive: boolean;
}

/**
 * Shared confirmation dialog (UX standard: destructive actions always confirm,
 * non-destructive ones never do).
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="message">{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close class="press-feedback" i18n>Cancel</button>
      <button
        matButton="filled"
        class="press-feedback"
        [class.destructive]="data.destructive"
        [mat-dialog-close]="true"
        cdkFocusInitial
      >
        {{ data.confirmLabel }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .message {
      color: var(--text-2);
      max-width: 26rem;
    }

    .destructive {
      --mat-sys-primary: var(--danger);
      --mdc-filled-button-container-color: var(--danger);
    }
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<ConfirmDialog>);
}

/** Imperative helper so callers stay one-liners. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(MatDialog);

  async confirm(options: {
    title: string;
    message: string;
    confirmLabel?: string;
    destructive?: boolean;
  }): Promise<boolean> {
    const ref = this.dialog.open(ConfirmDialog, {
      data: {
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? $localize`Confirm`,
        destructive: options.destructive ?? false,
      } satisfies ConfirmDialogData,
      width: '26rem',
    });
    const result = await firstValueFrom(ref.afterClosed());
    return result === true;
  }
}
