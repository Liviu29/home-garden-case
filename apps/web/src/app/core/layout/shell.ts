import { ChangeDetectionStrategy, Component, Injector, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatMenuModule } from '@angular/material/menu';
import { UsersApi } from '../api/users-api';
import { SessionStore } from '../auth/session-store';
import { ThemeStore } from '../config/theme-store';
import { toApiError } from '../errors/api-error';
import { ToastStore } from '../errors/toast-store';
import { QueryCache, cacheKeys } from '../resilience/query-cache';
import { ToastHost } from '../../shared/ui/toast/toast-host';

/** App shell: blurred topbar, animated active nav underline, profile menu. */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatMenuModule, ToastHost],
  template: `
    <div class="shell">
      <a class="skip-link" href="#main-content">Skip to content</a>
      <header class="topbar">
        <a routerLink="/" class="brand" aria-label="ItpHomeGarden home">
          <span class="mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M12 21 V11 M12 13 C12 8 8 6.5 4.5 7 C5 11.5 8.5 13.6 12 13 Z M12 11 C12 6.5 15.5 4.5 19.5 5 C19 10 15.5 12 12 11 Z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
          </span>
          <span class="name">HomeGarden</span>
        </a>

        <nav class="nav" aria-label="Primary">
          <a routerLink="/dashboard" routerLinkActive="active">Dashboard</a>
          <a routerLink="/gardens" routerLinkActive="active">Gardens</a>
        </nav>

        <button
          class="theme-toggle press-feedback"
          type="button"
          (click)="theme.toggle()"
          [attr.aria-label]="theme.isDark() ? 'Switch to light theme' : 'Switch to dark theme'"
        >
          @if (theme.isDark()) {
            <svg
              viewBox="0 0 24 24"
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4" />
              <path
                d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
              />
            </svg>
          } @else {
            <svg
              viewBox="0 0 24 24"
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z" />
            </svg>
          }
        </button>

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
        <span class="visually-hidden" role="status">{{
          deleting() ? 'Deleting profile…' : ''
        }}</span>
        <mat-menu #profileMenu="matMenu" xPosition="before">
          <button mat-menu-item (click)="editProfile()">Edit profile</button>
          <button mat-menu-item (click)="switchProfile()">Switch profile</button>
          <button mat-menu-item (click)="signOut()">Sign out</button>
          <button
            mat-menu-item
            class="danger-item"
            [disabled]="deleting()"
            (click)="deleteProfile()"
          >
            Delete profile
          </button>
        </mat-menu>
      </header>

      <main class="content" id="main-content" tabindex="-1">
        <router-outlet />
      </main>

      <!-- Every page ends in the case brief's own garden: a decorative photo
           rising out of the page on a gradient mask (fixed height, lazy — it
           never shifts anything and costs nothing until scrolled near). -->
      <div class="page-backdrop" aria-hidden="true">
        <img
          src="images/garden-backdrop-1600.webp"
          srcset="images/garden-backdrop-800.webp 800w, images/garden-backdrop-1600.webp 1600w"
          sizes="100vw"
          alt=""
          width="1600"
          height="800"
          loading="lazy"
          decoding="async"
        />
      </div>

      <app-toast-host />
    </div>
  `,
  styles: `
    .shell {
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      // Own stacking context: the page backdrop (z-index -1) paints beneath
      // the content but never beneath the page itself.
      position: relative;
      isolation: isolate;
    }

    // ── Page backdrop: the case brief's garden photo ─────────────────────────
    // In flow after <main>, pulled up under its bottom padding. A gradient MASK
    // (not a colour overlay) fades it into whatever page colour is behind it,
    // so the same photo sits right on the light theme and the dark one.
    .page-backdrop {
      position: relative;
      z-index: -1;
      height: clamp(14rem, 30vw, 26rem);
      margin-top: calc(-1 * var(--sp-16));
      overflow: hidden;
      pointer-events: none;

      img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center 62%;
        mask-image: linear-gradient(to bottom, transparent 0%, rgb(0 0 0 / 0.4) 38%, #000 88%);
      }
    }

    :host-context([data-theme='dark']) .page-backdrop img {
      filter: brightness(0.72) saturate(0.9);
    }

    // Visible only on keyboard focus (ACCESSIBILITY.md)
    .skip-link {
      position: absolute;
      top: -100%;
      left: var(--sp-4);
      z-index: 200;
      padding: var(--sp-2) var(--sp-4);
      background: var(--surface-inverse);
      color: var(--text-on-inverse);
      border-radius: 0 0 var(--radius-s) var(--radius-s);
      font-weight: 600;
      text-decoration: none;

      &:focus-visible {
        top: 0;
      }
    }

    .content:focus {
      outline: none;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      gap: var(--sp-8);
      padding: 0 var(--sp-6);
      height: 3.75rem;
      background: var(--topbar-glass);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-2);
      color: var(--text-1);
      font-weight: 700;
      letter-spacing: -0.01em;
      text-decoration: none;

      &:hover {
        text-decoration: none;
      }
    }

    .mark {
      display: grid;
      place-items: center;
      width: 1.875rem;
      height: 1.875rem;
      border-radius: var(--radius-s);
      background: var(--gradient-brand);
      color: white;
    }

    .nav {
      display: flex;
      gap: var(--sp-6);
      flex: 1;

      a {
        position: relative;
        color: var(--text-2);
        font-weight: 550;
        padding-block: 1.125rem;
        text-decoration: none;

        // Active-route underline: grows with a transform (not by animating
        // the right offset), so navigating never re-lays out the bar.
        &::after {
          content: '';
          position: absolute;
          inset-inline: 0;
          bottom: 0;
          height: 2px;
          background: var(--gradient-brand);
          transform: scaleX(0);
          transform-origin: left center;
          transition: transform var(--dur-base) var(--ease-out);
        }

        &:hover {
          color: var(--text-1);
        }

        &.active {
          color: var(--text-1);

          &::after {
            transform: scaleX(1);
          }
        }
      }
    }

    .theme-toggle {
      display: grid;
      place-items: center;
      width: 2.25rem;
      height: 2.25rem;
      border: 1px solid var(--border);
      background: var(--surface-1);
      border-radius: 50%;
      color: var(--text-2);
      cursor: pointer;

      &:hover {
        border-color: var(--border-strong);
        color: var(--text-1);
      }
    }

    .profile {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-2);
      border: 1px solid var(--border);
      background: var(--surface-1);
      border-radius: var(--radius-pill);
      padding: var(--sp-1) var(--sp-3) var(--sp-1) var(--sp-1);
      cursor: pointer;
      font: inherit;
      color: var(--text-2);

      &:hover {
        border-color: var(--border-strong);
      }
    }

    .avatar {
      display: grid;
      place-items: center;
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 50%;
      background: var(--gradient-hero);
      color: var(--text-on-dark);
      font-size: 0.6875rem;
      font-weight: 700;
    }

    .content {
      flex: 1;
      // 80rem (1280px): large desktops get real information density — the
      // dashboard control center and the garden planner both earn the width.
      width: min(80rem, 100% - var(--sp-8));
      margin-inline: auto;
      padding-bottom: var(--sp-16);
    }

    @media (max-width: 640px) {
      .topbar {
        gap: var(--sp-4);
      }

      .profile-name {
        display: none;
      }
    }

    // 360px-class phones: logo mark only, tighter rhythm (responsive audit)
    @media (max-width: 480px) {
      .topbar {
        gap: var(--sp-3);
        padding: 0 var(--sp-4);
      }

      .brand .name {
        display: none;
      }

      .nav {
        gap: var(--sp-4);
      }
    }
  `,
})
export class Shell {
  protected readonly session = inject(SessionStore);
  protected readonly theme = inject(ThemeStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly usersApi = inject(UsersApi);
  private readonly cache = inject(QueryCache);
  private readonly toasts = inject(ToastStore);

  protected readonly deleting = signal(false);

  constructor() {
    // The persisted session can outlive the profile it points at (deleted
    // elsewhere, or db.sqlite reset). A 404 signs out; a random 500 does not.
    void this.session.revalidate().then((valid) => {
      if (!valid) {
        this.toasts.error('That profile no longer exists. Please choose another.');
        void this.router.navigate(['/welcome']);
      }
    });
  }

  /**
   * PUT /users/{userId} — see ProfileDialog. Loaded on demand: the shell is in
   * the eager bundle, so a static import would drag Material's dialog and the
   * forms stack into the initial chunk (+180 kB, measured).
   */
  protected async editProfile(): Promise<void> {
    const [{ ProfileDialog }, { MatDialog }] = await Promise.all([
      import('../../features/profile/profile-dialog'),
      import('@angular/material/dialog'),
    ]);
    this.injector.get(MatDialog).open(ProfileDialog, { width: 'min(32rem, 96vw)' });
  }

  /**
   * DELETE /users/{userId}. Gardens are NOT owned by a profile in this backend
   * (no userId column anywhere), so the copy must not claim gardens are removed
   * — verified in API-INTEGRATION.md §4.
   */
  protected async deleteProfile(): Promise<void> {
    const profile = this.session.profile();
    if (!profile || this.deleting()) {
      return;
    }
    const { ConfirmService } = await import('../../shared/ui/confirm-dialog/confirm-dialog');
    const confirmed = await this.injector.get(ConfirmService).confirm({
      title: 'Delete profile?',
      message:
        `“${this.session.displayName()}” will be permanently deleted. ` +
        'Gardens and plants are shared and stay exactly as they are.',
      confirmLabel: 'Delete',
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
      this.toasts.success('Profile deleted.');
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
      this.toasts.error(`Couldn't delete the profile. ${error.message}`);
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
