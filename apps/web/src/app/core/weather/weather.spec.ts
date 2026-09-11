import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  OpenMeteoProvider,
  OutdoorConditions,
  OutdoorWeather,
  WEATHER_PROVIDER,
  WeatherProvider,
} from './weather';

const READING: OutdoorConditions = {
  humidity: 72,
  temperature: 18.4,
  observedAt: '2026-09-11T14:00',
};

describe('OpenMeteoProvider', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('asks Open-Meteo for the current humidity and temperature at the place', async () => {
    const reading = TestBed.inject(OpenMeteoProvider).current(51.05, 3.72);

    const request = TestBed.inject(HttpTestingController).expectOne(
      (r) => r.url === 'https://api.open-meteo.com/v1/forecast',
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('latitude')).toBe('51.05');
    expect(request.request.params.get('longitude')).toBe('3.72');
    expect(request.request.params.get('current')).toBe('relative_humidity_2m,temperature_2m');
    expect(request.request.params.get('timezone')).toBe('auto');
    request.flush({
      current: { time: '2026-09-11T14:00', relative_humidity_2m: 72, temperature_2m: 18.4 },
    });

    await expect(reading).resolves.toEqual(READING);
  });

  it('is the provider unless another is configured', () => {
    expect(TestBed.inject(WEATHER_PROVIDER)).toBeInstanceOf(OpenMeteoProvider);
    expect(TestBed.inject(OutdoorWeather).source).toBe('Open-Meteo');
  });
});

describe('OutdoorWeather', () => {
  let current: ReturnType<typeof vi.fn>;
  let weather: OutdoorWeather;

  beforeEach(() => {
    vi.useFakeTimers();
    current = vi.fn().mockResolvedValue(READING);
    const provider: WeatherProvider = {
      name: 'Test weather',
      current: current as WeatherProvider['current'],
    };
    TestBed.configureTestingModule({
      providers: [{ provide: WEATHER_PROVIDER, useValue: provider }],
    });
    weather = TestBed.inject(OutdoorWeather);
  });

  afterEach(() => vi.useRealTimers());

  it('sends coordinates rounded to about a kilometre, never the exact spot', async () => {
    await weather.forPlace(51.054321, 3.717654);
    expect(current).toHaveBeenCalledWith(51.05, 3.72);
  });

  it('asks once per place per fifteen minutes', async () => {
    await weather.forPlace(51.05, 3.72);
    await weather.forPlace(51.0512, 3.7199); // the same place, rounded
    vi.advanceTimersByTime(14 * 60_000);
    await weather.forPlace(51.05, 3.72);
    expect(current).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60_000);
    await weather.forPlace(51.05, 3.72);
    expect(current).toHaveBeenCalledTimes(2);
  });

  it('does not remember a failure: the next visit asks again', async () => {
    current.mockRejectedValueOnce(new Error('offline'));
    await expect(weather.forPlace(51.05, 3.72)).rejects.toThrow('offline');

    await expect(weather.forPlace(51.05, 3.72)).resolves.toEqual(READING);
    expect(current).toHaveBeenCalledTimes(2);
  });

  it('an old request failing late never evicts the newer reading', async () => {
    let failOld!: (reason: Error) => void;
    current.mockReturnValueOnce(new Promise((_, reject) => (failOld = reject)));
    const old = weather.forPlace(51.05, 3.72);
    vi.advanceTimersByTime(16 * 60_000); // stale: the next visit asks again
    await weather.forPlace(51.05, 3.72);

    failOld(new Error('late'));
    await expect(old).rejects.toThrow('late');

    await weather.forPlace(51.05, 3.72);
    expect(current).toHaveBeenCalledTimes(2); // the newer reading is still remembered
  });
});
