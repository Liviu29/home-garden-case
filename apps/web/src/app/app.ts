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
      }
    });
  }
}
