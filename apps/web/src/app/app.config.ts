import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';
import { baseUrlInterceptor, retryInterceptor } from './core/http/api-interceptors';
import { GlobalErrorHandler } from './core/errors/global-error-handler';

/**
 * ZONELESS: Angular 22 runs zoneless by default, so there is deliberately no
 * `provideZonelessChangeDetection()` call here — the provider is available and
 * stable, but it is not what enables zoneless behaviour in this major, and
 * adding it would imply otherwise. What actually proves it: `zone.js` is not a
 * dependency of this workspace at all (absent from `node_modules`), there is
 * no zone polyfill entry in `angular.json`, and nothing in `src/` references
 * `NgZone`. Change detection is driven entirely by signals + OnPush.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      // No transition on the very first navigation: there is no old page, so
      // the browser cross-faded a blank white snapshot into the first screen —
      // a grey flash on every cold load and reload (seen on the dark welcome).
      withViewTransitions({ skipInitialTransition: true }),
      // (Scroll-to-top on navigation lives in the root App component.)
    ),
    // Interceptor order matters: base-url first, then retry around the network call.
    provideHttpClient(withFetch(), withInterceptors([baseUrlInterceptor, retryInterceptor])),
    provideAnimationsAsync(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ],
};
