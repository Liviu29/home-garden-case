import { Routes } from '@angular/router';
import { sessionGuard } from './core/auth/session-guard';
import { Shell } from './core/layout/shell';

/**
 * Feature = route = chunk: everything below the shell
 * is lazy-loaded; the guard keeps session-less visitors in onboarding.
 */
export const routes: Routes = [
  {
    path: 'welcome',
    title: 'Welcome · HomeGarden',
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
        title: 'Dashboard · HomeGarden',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'gardens',
        title: 'Gardens · HomeGarden',
        loadComponent: () => import('./features/gardens/garden-list').then((m) => m.GardenList),
      },
      {
        path: 'gardens/:gardenId',
        // Refined to the garden's name once it loads (see GardenDetail).
        title: 'Garden · HomeGarden',
        loadComponent: () =>
          import('./features/garden-detail/garden-detail').then((m) => m.GardenDetail),
      },
    ],
  },
  {
    path: '**',
    title: 'Not found · HomeGarden',
    loadComponent: () => import('./pages/not-found').then((m) => m.NotFound),
  },
];
