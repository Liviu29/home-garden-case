import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** The weather outside a garden, now. */
export interface OutdoorConditions {
  /** Relative humidity at 2 m, in %. */
  readonly humidity: number;
  /** Air temperature at 2 m, in °C. */
  readonly temperature: number;
  /** When the reading was taken, in the place's own time zone (ISO, no offset). */
  readonly observedAt: string;
}

/**
 * Provider seam for outdoor conditions. Open-Meteo is the shipped
 * implementation — free, no key, CORS-enabled. Another service implements
 * this interface and is provided under `WEATHER_PROVIDER` instead; nothing
 * else changes.
 */
export interface WeatherProvider {
  /** Shown next to the reading, as its source. */
  readonly name: string;
  current(latitude: number, longitude: number): Promise<OutdoorConditions>;
}

interface OpenMeteoCurrent {
  readonly current: {
    readonly time: string;
    readonly relative_humidity_2m: number;
    readonly temperature_2m: number;
  };
}

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

@Injectable({ providedIn: 'root' })
export class OpenMeteoProvider implements WeatherProvider {
  readonly name = 'Open-Meteo';
  private readonly http = inject(HttpClient);

  async current(latitude: number, longitude: number): Promise<OutdoorConditions> {
    const params = new HttpParams()
      .set('latitude', latitude)
      .set('longitude', longitude)
      .set('current', 'relative_humidity_2m,temperature_2m')
      .set('timezone', 'auto');
    const { current } = await firstValueFrom(
      this.http.get<OpenMeteoCurrent>(OPEN_METEO_URL, { params }),
    );
    return {
      humidity: current.relative_humidity_2m,
      temperature: current.temperature_2m,
      observedAt: current.time,
    };
  }
}

export const WEATHER_PROVIDER = new InjectionToken<WeatherProvider>('WEATHER_PROVIDER', {
  providedIn: 'root',
  factory: () => inject(OpenMeteoProvider),
});

/** Outdoor humidity changes over hours, not seconds: a reading stays fresh this long. */
const FRESH_MS = 15 * 60_000;

/**
 * Outdoor conditions for a place. Coordinates are rounded to two decimals
 * (about a kilometre) before they leave the app — enough for the weather,
 * and less precise than the garden's own position. One request per place per
 * fifteen minutes; a failed request is not remembered, so the next visit
 * tries again.
 */
@Injectable({ providedIn: 'root' })
export class OutdoorWeather {
  private readonly provider = inject(WEATHER_PROVIDER);
  private readonly readings = new Map<string, { at: number; value: Promise<OutdoorConditions> }>();

  /** The provider's name, shown as the reading's source. */
  get source(): string {
    return this.provider.name;
  }

  forPlace(latitude: number, longitude: number): Promise<OutdoorConditions> {
    const lat = Math.round(latitude * 100) / 100;
    const lon = Math.round(longitude * 100) / 100;
    const key = `${lat},${lon}`;
    const cached = this.readings.get(key);
    if (cached && Date.now() - cached.at < FRESH_MS) {
      return cached.value;
    }
    const value = this.provider.current(lat, lon);
    this.readings.set(key, { at: Date.now(), value });
    value.catch(() => {
      // Forget a failure — unless a newer request has taken its place meanwhile.
      if (this.readings.get(key)?.value === value) {
        this.readings.delete(key);
      }
    });
    return value;
  }
}
