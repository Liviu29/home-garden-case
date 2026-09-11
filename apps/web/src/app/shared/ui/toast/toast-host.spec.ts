import { TestBed } from '@angular/core/testing';
import { APP_CONFIG, AppConfig } from '../../../core/config/app-config';
import { ToastStore } from '../../../core/errors/toast-store';
import { ToastHost } from './toast-host';

const CONFIG = { toastDurationMs: 5000 } as AppConfig;

const render = () => {
  const fixture = TestBed.createComponent(ToastHost);
  fixture.detectChanges();
  return fixture;
};

describe('ToastHost', () => {
  let store: ToastStore;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: APP_CONFIG, useValue: CONFIG }] });
    store = TestBed.inject(ToastStore);
  });

  afterEach(() => vi.useRealTimers());

  it('renders nothing when the queue is empty', () => {
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelectorAll('.toast')).toHaveLength(0);
  });

  it('announces politely so assistive tech reads new toasts', () => {
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('.host')?.getAttribute('aria-live')).toBe('polite');
  });

  it('renders a toast per queued item with its tone class', () => {
    store.success('Garden created');
    store.error('Could not save');
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;

    const toasts = el.querySelectorAll('.toast');
    expect(toasts).toHaveLength(2);
    expect(toasts[0].classList).toContain('success');
    expect(toasts[1].classList).toContain('error');
    expect(el.textContent).toContain('Garden created');
    expect(el.textContent).toContain('Could not save');
  });

  it('renders the info glyph for an info toast', () => {
    store.info('Layout reset');
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('.toast')?.classList).toContain('info');
    expect(el.querySelector('.glyph')?.textContent?.trim()).toBe('i');
  });

  it('renders no action button when the toast has no action', () => {
    store.error('No retry here');
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('.action')).toBeNull();
  });

  it('runs the action and dismisses the toast when the action is pressed', () => {
    const run = vi.fn();
    store.error('Could not load', { label: 'Try again', run });
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;

    const action = el.querySelector('.action') as HTMLButtonElement;
    expect(action.textContent?.trim()).toBe('Try again');

    action.click();
    fixture.detectChanges();

    expect(run).toHaveBeenCalledOnce();
    expect(store.toasts()).toHaveLength(0); // acting on a toast retires it
  });

  it('dismisses from the close button', () => {
    store.error('Dismiss me');
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;

    (el.querySelector('.close') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(store.toasts()).toHaveLength(0);
    expect(el.querySelectorAll('.toast')).toHaveLength(0);
  });

  it('labels the close button for screen readers', () => {
    store.error('x');
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('.close')?.getAttribute('aria-label')).toBe('Dismiss');
  });

  it('pauses the countdown while the pointer is on the toast', () => {
    store.success('Plant removed', { label: 'Undo', run: vi.fn() });
    const el = render().nativeElement as HTMLElement;
    const toast = el.querySelector('.toast') as HTMLElement;

    toast.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(60_000);
    expect(store.toasts()).toHaveLength(1);

    toast.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(10_000);
    expect(store.toasts()).toHaveLength(0);
  });

  it('pauses the countdown while focus is inside it, so a keyboard user reaches Undo in time', () => {
    store.success('Plant removed', { label: 'Undo', run: vi.fn() });
    const el = render().nativeElement as HTMLElement;
    const action = el.querySelector('.action') as HTMLButtonElement;
    expect(action.textContent?.trim()).toBe('Undo');

    action.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    vi.advanceTimersByTime(60_000);
    expect(store.toasts()).toHaveLength(1);

    action.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    vi.advanceTimersByTime(10_000);
    expect(store.toasts()).toHaveLength(0);
  });
});
