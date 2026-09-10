import { TestBed } from '@angular/core/testing';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { ToastStore } from './toast-store';

const CONFIG = { toastDurationMs: 5000 } as AppConfig;

describe('ToastStore', () => {
  let store: ToastStore;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: APP_CONFIG, useValue: CONFIG }] });
    store = TestBed.inject(ToastStore);
  });

  afterEach(() => vi.useRealTimers());

  it('auto-dismisses a success toast after the configured duration', () => {
    store.success('Garden created');
    expect(store.toasts()).toHaveLength(1);
    expect(store.toasts()[0]).toMatchObject({ tone: 'success', message: 'Garden created' });

    vi.advanceTimersByTime(4999);
    expect(store.toasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(store.toasts()).toHaveLength(0);
  });

  it('auto-dismisses an info toast', () => {
    store.info('Layout reset');
    expect(store.toasts()[0]).toMatchObject({ tone: 'info' });
    vi.advanceTimersByTime(5000);
    expect(store.toasts()).toHaveLength(0);
  });

  it('KEEPS an error toast until dismissed — errors must not vanish unread', () => {
    store.error('Could not save');
    vi.advanceTimersByTime(60_000);
    expect(store.toasts()).toHaveLength(1);
  });

  it('carries an optional action on an error toast', () => {
    const run = vi.fn();
    store.error('Could not load', { label: 'Try again', run });

    const toast = store.toasts()[0];
    expect(toast.actionLabel).toBe('Try again');
    toast.action?.();
    expect(run).toHaveBeenCalledOnce();
  });

  it('dismisses by id and leaves the others alone', () => {
    store.error('first');
    store.error('second');
    const [first, second] = store.toasts();

    store.dismiss(first.id);
    expect(store.toasts()).toHaveLength(1);
    expect(store.toasts()[0].id).toBe(second.id);
  });

  it('ignores a dismiss for an id that is already gone', () => {
    store.error('only');
    const [only] = store.toasts();
    store.dismiss(only.id);
    expect(() => store.dismiss(only.id)).not.toThrow();
    expect(store.toasts()).toHaveLength(0);
  });

  it('gives every toast a unique id, so queued toasts never collide', () => {
    store.error('a');
    store.error('b');
    store.error('c');
    const ids = store.toasts().map((t) => t.id);
    expect(new Set(ids).size).toBe(3);
  });
});
