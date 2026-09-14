import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import {
  IDEMPOTENCY_KEY_HEADER,
  baseUrlInterceptor,
  idempotencyKeyInterceptor,
  retryInterceptor,
} from './api-interceptors';

const SERVER_ERROR = { status: 500, statusText: 'Server Error' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('http interceptors (ADR-004 retry policy)', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([baseUrlInterceptor, idempotencyKeyInterceptor, retryInterceptor]),
        ),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    controller.verify();
    vi.useRealTimers();
  });

  it('prefixes relative urls with the api base', async () => {
    const request = firstValueFrom(http.get('/gardens'));
    controller.expectOne('/api/gardens').flush([]);
    await expect(request).resolves.toEqual([]);
  });

  it('retries a transient 500 and succeeds silently (the 10% random error)', async () => {
    vi.useFakeTimers();
    const request = firstValueFrom(http.get('/gardens'));

    controller.expectOne('/api/gardens').flush({ error: 'Random error thrown' }, SERVER_ERROR);
    await vi.runAllTimersAsync(); // backoff delay before attempt 2

    controller.expectOne('/api/gardens').flush([{ gardenId: 1 }]);
    await expect(request).resolves.toEqual([{ gardenId: 1 }]);
  });

  it('gives up after exhausting the retry budget', async () => {
    vi.useFakeTimers();
    const request = firstValueFrom(http.get('/gardens'));
    // Attach the expectation up front so the final rejection is already handled.
    const expectation = expect(request).rejects.toMatchObject({ status: 500 });
    const attempts = 4; // initial + 3 retries

    for (let i = 0; i < attempts; i++) {
      controller.expectOne('/api/gardens').flush({ error: 'Random error thrown' }, SERVER_ERROR);
      await vi.runAllTimersAsync();
    }

    await expectation;
  });

  it('NEVER retries a functional 4xx verdict (overcrowding must surface once)', async () => {
    const request = firstValueFrom(http.post('/plants', {}));

    controller
      .expectOne('/api/plants')
      .flush({ message: 'Cannot add plant' }, { status: 400, statusText: 'Bad Request' });

    await expect(request).rejects.toMatchObject({ status: 400 });
    controller.expectNone('/api/plants');
  });

  describe('writes', () => {
    it('stamps every POST with one Idempotency-Key, and only POSTs', async () => {
      const post = firstValueFrom(http.post('/gardens', {}));
      const sent = controller.expectOne('/api/gardens');
      expect(sent.request.headers.get(IDEMPOTENCY_KEY_HEADER)).toMatch(UUID);
      sent.flush({ gardenId: 1 });
      await post;

      const put = firstValueFrom(http.put('/gardens/1', {}));
      const updated = controller.expectOne('/api/gardens/1');
      expect(updated.request.headers.has(IDEMPOTENCY_KEY_HEADER)).toBe(false);
      updated.flush({ gardenId: 1 });
      await put;
    });

    it('keeps a caller-supplied key', async () => {
      const post = firstValueFrom(
        http.post('/gardens', {}, { headers: { [IDEMPOTENCY_KEY_HEADER]: 'mine' } }),
      );
      const sent = controller.expectOne('/api/gardens');
      expect(sent.request.headers.get(IDEMPOTENCY_KEY_HEADER)).toBe('mine');
      sent.flush({ gardenId: 1 });
      await post;
    });

    it('re-sends a failed POST with the SAME key, so the API can de-duplicate it', async () => {
      vi.useFakeTimers();
      const request = firstValueFrom(http.post('/gardens', { gardenName: 'Once' }));

      const first = controller.expectOne('/api/gardens');
      const key = first.request.headers.get(IDEMPOTENCY_KEY_HEADER);
      first.flush({ error: 'Random error thrown' }, SERVER_ERROR);
      await vi.runAllTimersAsync();

      const second = controller.expectOne('/api/gardens');
      expect(second.request.headers.get(IDEMPOTENCY_KEY_HEADER)).toBe(key);
      second.flush({ gardenId: 7 });
      await expect(request).resolves.toEqual({ gardenId: 7 });
    });

    it('re-sends a POST that never got an answer (network error) — safe, because the key repeats', async () => {
      vi.useFakeTimers();
      const request = firstValueFrom(http.post('/plants', {}));

      const first = controller.expectOne('/api/plants');
      const key = first.request.headers.get(IDEMPOTENCY_KEY_HEADER);
      first.error(new ProgressEvent('error'), { status: 0 });
      await vi.runAllTimersAsync();

      const second = controller.expectOne('/api/plants');
      expect(second.request.headers.get(IDEMPOTENCY_KEY_HEADER)).toBe(key);
      second.flush({ plantId: 2 });
      await expect(request).resolves.toEqual({ plantId: 2 });
    });

    it('does not repeat a POST without a key — it might already have landed', async () => {
      vi.useFakeTimers();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          // The retry alone, as a codebase without the key interceptor would run it.
          provideHttpClient(withInterceptors([baseUrlInterceptor, retryInterceptor])),
          provideHttpClientTesting(),
        ],
      });
      http = TestBed.inject(HttpClient);
      controller = TestBed.inject(HttpTestingController);

      const request = firstValueFrom(http.post('/gardens', {}));
      const expectation = expect(request).rejects.toMatchObject({ status: 500 });
      controller.expectOne('/api/gardens').flush({ error: 'Random error thrown' }, SERVER_ERROR);
      await vi.runAllTimersAsync();

      controller.expectNone('/api/gardens');
      await expectation;
    });
  });
});
