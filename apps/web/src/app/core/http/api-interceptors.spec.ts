import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { baseUrlInterceptor, retryInterceptor } from './api-interceptors';

describe('http interceptors (ADR-004 retry policy)', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([baseUrlInterceptor, retryInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('prefixes relative urls with the api base', async () => {
    const request = firstValueFrom(http.get('/gardens'));
    controller.expectOne('/api/gardens').flush([]);
    await expect(request).resolves.toEqual([]);
  });

  it('retries a transient 500 and succeeds silently (the 10% random error)', async () => {
    vi.useFakeTimers();
    const request = firstValueFrom(http.get('/gardens'));

    controller
      .expectOne('/api/gardens')
      .flush({ error: 'Random error thrown' }, { status: 500, statusText: 'Server Error' });
    await vi.runAllTimersAsync(); // backoff delay before attempt 2

    controller.expectOne('/api/gardens').flush([{ gardenId: 1 }]);
    await expect(request).resolves.toEqual([{ gardenId: 1 }]);
    vi.useRealTimers();
  });

  it('gives up after exhausting the retry budget', async () => {
    vi.useFakeTimers();
    const request = firstValueFrom(http.get('/gardens'));
    // Attach the expectation up front so the final rejection is already handled.
    const expectation = expect(request).rejects.toMatchObject({ status: 500 });
    const attempts = 4; // initial + 3 retries

    for (let i = 0; i < attempts; i++) {
      controller
        .expectOne('/api/gardens')
        .flush({ error: 'Random error thrown' }, { status: 500, statusText: 'Server Error' });
      await vi.runAllTimersAsync();
    }

    await expectation;
    vi.useRealTimers();
  });

  it('NEVER retries a functional 4xx verdict (overcrowding must surface once)', async () => {
    const request = firstValueFrom(http.post('/plants', {}));

    controller
      .expectOne('/api/plants')
      .flush({ message: 'Cannot add plant' }, { status: 400, statusText: 'Bad Request' });

    await expect(request).rejects.toMatchObject({ status: 400 });
    controller.expectNone('/api/plants');
  });
});
