import { ChangeDetectionStrategy, Component, Injector, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatMenuModule } from '@angular/material/menu';
import { UsersApi } from '../../api/users-api';
import { SessionStore } from '../../auth/session-store';
import { toApiError } from '../../errors/api-error';
import { ToastStore } from '../../errors/toast-store';
import { QueryCache, cacheKeys } from '../../resilience/query-cache';

/**
 * The profile chip and its menu: edit, switch, sign out, delete.
 *
 * The one Material component in the app shell — and Material's menu brings
 * the CDK overlay with it, about 100 kB of the initial bundle when it was
 * imported by the shell itself. The shell renders this component in a
 * `@defer (on idle)` block instead: the chip is painted at once as a
 * placeholder, and the menu's chunk arrives as soon as the browser is idle
 * after first paint — before anyone has reached for it.
 */
@Component({
  selector: 'app-account-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatMenuModule],
  template: `
    <!-- While its DELETE is in flight the profile chip is a mutation ghost:
         visibly pending, inert, announced — never a silent wait. -->
    <button
      class="profile press-feedback"
      [class.mutation-ghost]="deleting()"
      [attr.aria-busy]="deleting() ? true : null"
      [attr.inert]="deleting() ? '' : null"
      [matMenuTriggerFor]="profileMenu"
      type="button"
    >
      <span class="avatar" aria-hidden="true">{{ session.initials() }}</span>
      <span class="profile-name">{{ session.displayName() }}</span>
    </button>
    <span class="visually-hidden" role="status">
      @if (deleting()) {
        <ng-container i18n>Deleting profile…</ng-container>
      }
    </span>
    <mat-menu #profileMenu="matMenu" xPosition="before">
      <button type="button" mat-menu-item (click)="editProfile()" i18n>Edit profile</button>
      <button type="button" mat-menu-item (click)="switchProfile()" i18n>Switch profile</button>
      <button type="button" mat-menu-item (click)="signOut()" i18n>Sign out</button>
      <button
        type="button"
        mat-menu-item
        class="danger-item"
        [disabled]="deleting()"
        (click)="deleteProfile()"
        i18n
      >
        Delete profile
      </button>
    </mat-menu>
  `,
  styleUrl: './account-menu.scss',
})
export class AccountMenu {
  protected readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly usersApi = inject(UsersApi);
  private readonly cache = inject(QueryCache);
  private readonly toasts = inject(ToastStore);

  protected readonly deleting = signal(false);

  /**
   * PUT /users/{userId} — see ProfileDialog. Loaded on demand: a static
   * import would drag Material's dialog and the forms stack into this
   * chunk (+180 kB, measured).
   */
  protected async editProfile(): Promise<void> {
    const [{ ProfileDialog }, { MatDialog }] = await Promise.all([
      import('../../../features/profile/profile-dialog'),
      import('@angular/material/dialog'),
    ]);
    this.injector.get(MatDialog).open(ProfileDialog, { width: 'min(32rem, 96vw)' });
  }

  /**
   * DELETE /users/{userId}. The API does not delete a profile's gardens: it
   * hands them back to everyone as shared gardens (ADR-009), so the copy
   * says exactly that.
   */
  protected async deleteProfile(): Promise<void> {
    const profile = this.session.profile();
    if (!profile || this.deleting()) {
      return;
    }
    const { ConfirmService } = await import('../../../shared/ui/confirm-dialog/confirm-dialog');
    const name = this.session.displayName();
    const confirmed = await this.injector.get(ConfirmService).confirm({
      title: $localize`Delete profile?`,
      message: $localize`“${name}:name:” will be permanently deleted. Its gardens and plants stay, shared with every profile.`,
      confirmLabel: $localize`Delete`,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    this.deleting.set(true);
    try {
      await this.usersApi.delete(profile.userId);
      this.cache.invalidate(cacheKeys.users);
      this.session.signOut();
      this.toasts.success($localize`Profile deleted.`);
      void this.router.navigate(['/welcome']);
    } catch (err) {
      const error = toApiError(err);
      if (error.kind === 'not-found') {
        // Already gone server-side — reconcile instead of showing an error.
        this.cache.invalidate(cacheKeys.users);
        this.session.signOut();
        void this.router.navigate(['/welcome']);
        return;
      }
      this.toasts.error($localize`Couldn't delete the profile. ${error.message}:reason:`);
    } finally {
      this.deleting.set(false);
    }
  }

  protected switchProfile(): void {
    void this.router.navigate(['/welcome']);
  }

  protected signOut(): void {
    this.session.signOut();
    void this.router.navigate(['/welcome']);
  }
}
