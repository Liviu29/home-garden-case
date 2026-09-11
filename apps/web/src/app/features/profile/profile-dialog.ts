import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { UsersApi } from '../../core/api/users-api';
import { SessionStore } from '../../core/auth/session-store';
import { toApiError } from '../../core/errors/api-error';
import { QueryCache, cacheKeys } from '../../core/resilience/query-cache';
import { ToastStore } from '../../core/errors/toast-store';

/**
 * Edit the active profile — `PUT /users/{userId}` (backend audit: a capability
 * the API has always exposed and the UI never used).
 *
 * Contract notes that shape this form:
 * - the update schema equals the create schema, so a **full payload** is sent
 * - `age` must be a positive integer when present (verified: 0 → 400)
 * - moving onto another profile's address answers **409**, rendered inline
 */
@Component({
  selector: 'app-profile-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>Edit profile</h2>
    <mat-dialog-content>
      <form class="form" [formGroup]="form" id="profile-form" (ngSubmit)="submit()">
        <div class="row">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>First name</mat-label>
            <input matInput formControlName="firstName" autocomplete="given-name" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Last name</mat-label>
            <input matInput formControlName="lastName" autocomplete="family-name" />
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline">
          <mat-label>Email address</mat-label>
          <input matInput type="email" formControlName="emailAddress" autocomplete="email" />
          @if (form.controls.emailAddress.hasError('required')) {
            <mat-error>Email address is required</mat-error>
          }
          @if (form.controls.emailAddress.hasError('email')) {
            <mat-error>That doesn't look like an email address</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Age</mat-label>
          <input matInput type="number" formControlName="age" min="1" step="1" />
          <mat-hint>Optional</mat-hint>
          @if (form.controls.age.hasError('min')) {
            <mat-error>Age must be a positive whole number</mat-error>
          }
        </mat-form-field>

        @if (serverError()) {
          <p class="form-error" role="alert">{{ serverError() }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close class="press-feedback" [disabled]="saving()">
        Cancel
      </button>
      <button
        matButton="filled"
        type="submit"
        form="profile-form"
        class="press-feedback"
        [disabled]="saving()"
        [attr.aria-busy]="saving() ? true : null"
      >
        <span class="btn-stack" [class.is-pending]="saving()">
          <span class="btn-label">Save changes</span>
          @if (saving()) {
            <span class="btn-ghost" aria-hidden="true"></span>
            <span class="visually-hidden">Saving profile</span>
          }
        </span>
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: grid;
      gap: var(--sp-3);
      min-width: min(28rem, 84vw);
      padding-top: var(--sp-1);
    }

    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--sp-3);

      @media (max-width: 480px) {
        grid-template-columns: 1fr;
      }
    }

    .form-error {
      color: var(--danger);
      font-size: var(--fs-caption);
      font-weight: 550;
    }
  `,
})
export class ProfileDialog {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly ref = inject(MatDialogRef<ProfileDialog>);
  private readonly api = inject(UsersApi);
  private readonly cache = inject(QueryCache);
  private readonly session = inject(SessionStore);
  private readonly toasts = inject(ToastStore);

  protected readonly saving = signal(false);
  protected readonly serverError = signal<string | null>(null);

  private readonly profile = this.session.profile();

  // Mirrors user.schema.ts: email required, age a positive int when present.
  protected readonly form = this.fb.group({
    firstName: this.fb.control(this.profile?.firstName ?? ''),
    lastName: this.fb.control(this.profile?.lastName ?? ''),
    emailAddress: this.fb.control(this.profile?.emailAddress ?? '', [
      Validators.required,
      Validators.email,
    ]),
    age: this.fb.control<number | null>(this.profile?.age ?? null, [Validators.min(1)]),
  });

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    const profile = this.profile;
    if (this.form.invalid || this.saving() || !profile) {
      return; // single-flight: a second click while saving is ignored
    }
    this.saving.set(true);
    this.serverError.set(null);

    const raw = this.form.getRawValue();
    try {
      const updated = await this.api.update(profile.userId, {
        emailAddress: raw.emailAddress.trim(),
        firstName: raw.firstName.trim() || null,
        lastName: raw.lastName.trim() || null,
        age: raw.age === null || Number.isNaN(raw.age) ? null : raw.age,
      });
      // Server response is authoritative — adopt it rather than the form values.
      this.session.signIn(updated);
      this.cache.invalidate(cacheKeys.users);
      this.toasts.success('Profile updated.');
      this.ref.close(true);
    } catch (err) {
      const error = toApiError(err);
      this.serverError.set(
        error.status === 409 ? 'Another profile already uses that email address.' : error.message,
      );
    } finally {
      this.saving.set(false);
    }
  }
}
