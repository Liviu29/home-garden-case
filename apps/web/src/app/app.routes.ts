import { Routes } from '@angular/router';
import { sessionGuard } from './core/auth/session-guard';
import { Shell } from './core/layout/shell';

/**
 * Feature = route = chunk (CODING-GUIDELINES §2): everything below the shell
 * is lazy-loaded; the guard keeps session-less visitors in onboarding.
 */
export const routes: Routes = [
  {
    path: 'welcome',
    loadComponent: () => import('./features/onboarding/onboarding').then((m) => m.Onboarding),
  },
  {
    path: '',
    component: Shell,
    canMatch: [sessionGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'gardens',
        loadComponent: () => import('./features/gardens/garden-list').then((m) => m.GardenList),
      },
      {
        path: 'gardens/:gardenId',
        loadComponent: () =>
          import('./features/garden-detail/garden-detail').then((m) => m.GardenDetail),
      },
    ],
  },
  {
    path: '**',
    loadComponent: () => import('./pages/not-found').then((m) => m.NotFound),
  },
];
