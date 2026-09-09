import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { SessionStore } from './session-store';

/** Feature routes require an active profile; visitors go to onboarding (ADR-005). */
export const sessionGuard: CanMatchFn = () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  return session.isActive() ? true : router.createUrlTree(['/welcome']);
};
