import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatMenuModule } from '@angular/material/menu';
import { SessionStore } from '../auth/session-store';
import { ToastHost } from '../../shared/ui/toast/toast-host';

/** App shell: blurred topbar, animated active nav underline, profile menu. */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatMenuModule, ToastHost],
  template: `
    <div class="shell">
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

        <button class="profile press-feedback" [matMenuTriggerFor]="profileMenu" type="button">
          <span class="avatar" aria-hidden="true">{{ session.initials() }}</span>
          <span class="profile-name">{{ session.displayName() }}</span>
        </button>
        <mat-menu #profileMenu="matMenu" xPosition="before">
          <button mat-menu-item (click)="switchProfile()">Switch profile</button>
          <button mat-menu-item (click)="signOut()">Sign out</button>
        </mat-menu>
      </header>

      <main class="content">
        <router-outlet />
      </main>

      <app-toast-host />
    </div>
  `,
  styles: `
    .shell {
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
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
      background: rgb(255 255 255 / 0.75);
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

        &::after {
          content: '';
          position: absolute;
          left: 0;
          right: 100%;
          bottom: 0;
          height: 2px;
          background: var(--gradient-brand);
          transition: right var(--dur-base) var(--ease-out);
        }

        &:hover {
          color: var(--text-1);
        }

        &.active {
          color: var(--text-1);

          &::after {
            right: 0;
          }
        }
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
      width: min(72rem, 100% - var(--sp-8));
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
  `,
})
export class Shell {
  protected readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  protected switchProfile(): void {
    void this.router.navigate(['/welcome']);
  }

  protected signOut(): void {
    this.session.signOut();
    void this.router.navigate(['/welcome']);
  }
}
