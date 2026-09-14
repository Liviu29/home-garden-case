import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NavigationEnd, NavigationStart, Router, RouterOutlet } from '@angular/router';

/** Root shell host — everything lives behind the router. */
@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  constructor() {
    // A new page opens at its top instead of inheriting the previous page's
    // scroll offset (a garden opened from a scrolled list landed mid-page);
    // Back/Forward is left to the browser's own restoration. A few lines here
    // rather than `withInMemoryScrolling`, whose scroller machinery pushed the
    // eager bundle past its 500 kB budget. The root lives as long as the app.
    let popstate = false;
    inject(Router).events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        popstate = event.navigationTrigger === 'popstate';
      } else if (event instanceof NavigationEnd && !popstate) {
        window.scrollTo(0, 0);
        // Keyboard and screen-reader users start the new page at its content,
        // not wherever focus was left on the old one. The first navigation is
        // the page load: a document starts at its top by itself.
        if (event.id > 1) {
          document.getElementById('main-content')?.focus({ preventScroll: true });
        }
      }
    });
  }
}
