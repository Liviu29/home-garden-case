import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiError } from '../errors/api-error';
import { UsersApi } from './users-api';

const userDto = (userId: number, emailAddress: string) => ({
  userId,
  emailAddress,
  firstName: 'First',
  lastName: 'Last',
  age: 30,
  createdAt: '',
  updatedAt: '',
});

/**
 * The /users client (ADR-005). Two properties matter beyond "it calls a URL":
 * every response is mapped to the domain shape, and every failure surfaces as
 * a typed ApiError rather than a raw HttpErrorResponse.
 */
describe('UsersApi', () => {
  let api: UsersApi;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(UsersApi);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('lists profiles and maps every DTO to the domain shape', async () => {
    const pending = api.getAll();
    controller.expectOne('/users').flush([userDto(1, 'a@b.c'), userDto(2, 'd@e.f')]);

    const profiles = await pending;
    expect(profiles).toHaveLength(2);
    expect(profiles[0]).toEqual({
      userId: 1,
      emailAddress: 'a@b.c',
      firstName: 'First',
      lastName: 'Last',
      age: 30,
    });
  });

  it('fetches one profile by id', async () => {
    const pending = api.getById(42);
    controller.expectOne('/users/42').flush(userDto(42, 'x@y.z'));
    await expect(pending).resolves.toMatchObject({ userId: 42 });
  });

  it('url-encodes the address when looking a profile up by email', async () => {
    const pending = api.getByEmail('someone+tag@example.com');
    controller.expectOne('/users/email/someone%2Btag%40example.com').flush(userDto(3, 'x@y.z'));
    await expect(pending).resolves.toMatchObject({ userId: 3 });
  });

  it('creates a profile with a POST', async () => {
    const input = { emailAddress: 'n@e.w', firstName: 'N', lastName: 'W', age: 20 };
    const pending = api.create(input);
    const request = controller.expectOne('/users');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    request.flush(userDto(4, 'n@e.w'));
    await expect(pending).resolves.toMatchObject({ userId: 4 });
  });

  it('updates with a full-payload PUT (the backend rejects partials)', async () => {
    const input = { emailAddress: 'n@e.w', firstName: 'N', lastName: 'W', age: 21 };
    const pending = api.update(4, input);
    const request = controller.expectOne('/users/4');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(input);
    request.flush(userDto(4, 'n@e.w'));
    await expect(pending).resolves.toMatchObject({ userId: 4 });
  });

  it('deletes and resolves to void', async () => {
    const pending = api.delete(4);
    const request = controller.expectOne('/users/4');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
    await expect(pending).resolves.toBeUndefined();
  });

  it('surfaces a 404 as a typed not-found ApiError, never a raw HttpErrorResponse', async () => {
    const pending = api.getByEmail('missing@example.com');
    controller
      .expectOne('/users/email/missing%40example.com')
      .flush({ message: 'User not found' }, { status: 404, statusText: 'Not Found' });

    await expect(pending).rejects.toBeInstanceOf(ApiError);
    await expect(pending).rejects.toMatchObject({ kind: 'not-found' });
  });

  it('surfaces a 409 duplicate-email as a functional ApiError', async () => {
    const pending = api.create({ emailAddress: 'taken@example.com' });
    controller
      .expectOne('/users')
      .flush({ message: 'Email already exists' }, { status: 409, statusText: 'Conflict' });

    await expect(pending).rejects.toMatchObject({ kind: 'functional', status: 409 });
  });
});
