import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { UsersApi } from '../../core/api/users-api';
import { UserProfile } from '../../core/api/models';
import { SessionStore } from '../../core/auth/session-store';
import { toApiError } from '../../core/errors/api-error';
import { QueryCache, cacheKeys } from '../../core/resilience/query-cache';
import { Skeleton } from '../../shared/ui/skeleton/skeleton';
import { SkeletonGroup } from '../../shared/ui/skeleton/skeleton-group';

type Status = 'loading' | 'ready' | 'error';

/**
 * Profile selection — the shipped half of ADR-005. Lists profiles from the
 * real /users API, creates one inline, and establishes the local session.
 */
@Component({
  selector: 'app-onboarding',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    Skeleton,
    SkeletonGroup,
  ],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.scss',
})
export class Onboarding {
  private readonly api = inject(UsersApi);
  private readonly cache = inject(QueryCache);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly profiles = signal<readonly UserProfile[]>([]);
  protected readonly status = signal<Status>('loading');
  protected readonly creating = signal(false);
  protected readonly showCreate = signal(false);
  protected readonly serverError = signal<string | null>(null);

  // Rules mirror apps/api/src/app/schemas/user.schema.ts
  protected readonly form = this.fb.group({
    firstName: this.fb.control(''),
    lastName: this.fb.control(''),
    emailAddress: this.fb.control('', [Validators.required, Validators.email]),
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.status.set('loading');
    const { cached, revalidate } = this.cache.swr(cacheKeys.users, () => this.api.getAll());
    if (cached) {
      this.profiles.set(cached);
      this.status.set('ready');
    }
    if (!revalidate) {
      return;
    }
    try {
      this.profiles.set(await revalidate);
      this.status.set('ready');
    } catch {
      if (!cached) {
        this.status.set('error');
      }
    }
  }

  protected select(profile: UserProfile): void {
    this.session.signIn(profile);
    void this.router.navigate(['/dashboard']);
  }

  protected initialsOf(profile: UserProfile): string {
    const first = profile.firstName?.[0] ?? profile.emailAddress[0];
    const last = profile.lastName?.[0] ?? '';
    return (first + last).toUpperCase();
  }

  protected nameOf(profile: UserProfile): string {
    return [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.emailAddress;
  }

  protected async create(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.creating()) {
      return;
    }
    this.creating.set(true);
    this.serverError.set(null);

    const raw = this.form.getRawValue();
    try {
      const created = await this.api.create({
        emailAddress: raw.emailAddress.trim(),
        firstName: raw.firstName.trim() || null,
        lastName: raw.lastName.trim() || null,
      });
      this.cache.invalidate(cacheKeys.users);
      this.select(created);
    } catch (err) {
      const error = toApiError(err);
      this.serverError.set(error.message);
    } finally {
      this.creating.set(false);
    }
  }
}
