import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotFound } from './not-found';

/**
 * Deep-link misses get a page, not a toast. The 404 is
 * a standalone page, so it must own the document's single `h1` — a nested
 * heading level here would leave the route with no top-level heading at all.
 */
describe('NotFound page', () => {
  const render = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(NotFound);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('renders the designed empty state rather than a bare error', () => {
    const el = render();
    expect(el.textContent).toContain('This patch is empty');
    expect(el.textContent).toContain("doesn't exist");
  });

  it('owns the page h1', () => {
    const el = render();
    const headings = el.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('This patch is empty');
  });

  it('offers a way back rather than a dead end', () => {
    const link = render().querySelector('a');
    expect(link?.getAttribute('href')).toBe('/');
    expect(link?.textContent).toContain('Back to the garden');
  });
});
