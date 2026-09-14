import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { wholeNumber } from '../../core/forms/whole-number';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { UsersApi } from '../../core/api/users-api';
import type { UserProfile } from '../../core/api/models';
import { SessionStore } from '../../core/auth/session-store';
import { toApiError } from '../../core/errors/api-error';
import { QueryCache, cacheKeys } from '../../core/resilience/query-cache';
import { ThemeStore } from '../../core/config/theme-store';
import { PlantArtworkDefs } from '../../shared/ui/plant-visuals/plant-artwork-defs';
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
    PlantArtworkDefs,
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
  protected readonly theme = inject(ThemeStore);

  protected readonly themeLabel = computed(() =>
    this.theme.isDark() ? $localize`Switch to light theme` : $localize`Switch to dark theme`,
  );

  protected readonly profiles = signal<readonly UserProfile[]>([]);
  protected readonly status = signal<Status>('loading');
  protected readonly creating = signal(false);
  protected readonly showCreate = signal(false);
  /** The backdrop photo has decoded — it fades in then, instead of popping. */
  protected readonly photoReady = signal(false);
  protected readonly serverError = signal<string | null>(null);
  /**
   * Set when POST /users answers 409 (verified: "User with email x already
   * exists"). The address is already a profile, so we offer to continue as it
   * via GET /users/email/{emailAddress} instead of stranding the user.
   */
  protected readonly duplicateEmail = signal<string | null>(null);
  protected readonly resolvingDuplicate = signal(false);

  // Rules mirror apps/api/src/app/schemas/user.schema.ts
  protected readonly form = this.fb.group({
    firstName: this.fb.control(''),
    lastName: this.fb.control(''),
    emailAddress: this.fb.control('', [Validators.required, Validators.email]),
    age: this.fb.control<number | null>(null, [Validators.min(1), wholeNumber]),
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
    this.duplicateEmail.set(null);

    const raw = this.form.getRawValue();
    const emailAddress = raw.emailAddress.trim();
    try {
      const created = await this.api.create({
        emailAddress,
        firstName: raw.firstName.trim() || null,
        lastName: raw.lastName.trim() || null,
        age: raw.age === null || Number.isNaN(raw.age) ? null : raw.age,
      });
      this.cache.invalidate(cacheKeys.users);
      this.select(created);
    } catch (err) {
      const error = toApiError(err);
      if (error.status === 409) {
        this.duplicateEmail.set(emailAddress);
        this.serverError.set($localize`A profile already uses that email address.`);
      } else {
        this.serverError.set(error.message);
      }
    } finally {
      this.creating.set(false);
    }
  }

  /** Recovery path for the 409 above — GET /users/email/{emailAddress}. */
  protected async continueAsExisting(): Promise<void> {
    const email = this.duplicateEmail();
    if (!email || this.resolvingDuplicate()) {
      return;
    }
    this.resolvingDuplicate.set(true);
    try {
      this.select(await this.api.getByEmail(email));
    } catch (err) {
      const error = toApiError(err);
      this.serverError.set(
        error.kind === 'not-found'
          ? $localize`That profile could not be opened. Try picking it from the list.`
          : error.message,
      );
    } finally {
      this.resolvingDuplicate.set(false);
    }
  }
}
