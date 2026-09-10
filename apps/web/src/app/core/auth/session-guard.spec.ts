import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { UsersApi } from '../api/users-api';
import { SessionStore } from './session-store';
import { sessionGuard } from './session-guard';

type GuardArgs = Parameters<typeof sessionGuard>;

const runGuard = (): boolean | UrlTree =>
  TestBed.runInInjectionContext(() => sessionGuard(...([{}, [], {}] as unknown as GuardArgs))) as
    boolean | UrlTree;

describe('sessionGuard (feature routes require a profile)', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: UsersApi, useValue: {} }],
    });
  });

  it('lets an active session through', () => {
    TestBed.inject(SessionStore).signIn({
      userId: 1,
      emailAddress: 'a@b.c',
      firstName: null,
      lastName: null,
      age: null,
    });
    expect(runGuard()).toBe(true);
  });

  it('redirects a visitor without a session to onboarding', () => {
    const result = runGuard();
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/welcome');
  });
});
