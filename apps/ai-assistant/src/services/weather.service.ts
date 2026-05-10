import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { catchError, map, Observable, of, switchMap } from 'rxjs';

import { HttpService } from '@app/common/http';

import { DayForecast, WeatherContext } from '../types/weather-context.type';

interface GeocodingResult {
  name: string;
  lat: number;
  lon: number;
}

interface ForecastItem {
  dt: number;
  main: { temp: number; humidity: number };
  wind: { speed: number };
  weather: Array<{ description: string }>;
}

interface ForecastResponse {
  list: ForecastItem[];
}

const GEO_URL = 'https://api.openweathermap.org/geo/1.0/direct';
const FORECAST_URL = 'https://api.openweathermap.org/data/2.5/forecast';
const REQUEST_TIMEOUT_MS = 5000;

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  getForecast(city: string): Observable<WeatherContext | null> {
    const apiKey = this.configService.get<string>('OPENWEATHERMAP_API_KEY');
    if (!apiKey || !city) {
      return of(null);
    }

    return this.geocode(city, apiKey).pipe(
      switchMap((location) => {
        if (!location) {
          return of(null);
        }

        return this.httpService
          .get<ForecastResponse>(FORECAST_URL, {
            params: {
              lat: location.lat,
              lon: location.lon,
              appid: apiKey,
              units: 'metric',
              cnt: 40,
            },
            timeoutMs: REQUEST_TIMEOUT_MS,
          })
          .pipe(map((data) => this.mapResponse(location.name, data)));
      }),
      catchError((error) => {
        this.logger.warn(
          `Weather forecast failed for "${city}": ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return of(null);
      }),
    );
  }

  private geocode(
    city: string,
    apiKey: string,
  ): Observable<GeocodingResult | null> {
    return this.httpService
      .get<GeocodingResult[]>(GEO_URL, {
        params: { q: city, limit: 1, appid: apiKey },
        timeoutMs: REQUEST_TIMEOUT_MS,
      })
      .pipe(
        map((results) =>
          Array.isArray(results) && results.length ? results[0] : null,
        ),
      );
  }

  private mapResponse(
    cityName: string,
    response: ForecastResponse,
  ): WeatherContext | null {
    if (!response?.list?.length) {
      return null;
    }

    const byDay = new Map<string, ForecastItem[]>();
    for (const item of response.list) {
      const date = new Date(item.dt * 1000).toISOString().slice(0, 10);
      const bucket = byDay.get(date) ?? [];
      bucket.push(item);
      byDay.set(date, bucket);
    }

    const dailyForecast: DayForecast[] = Array.from(byDay.entries()).map(
      ([date, items]) => {
        // prefer the noon slot, fall back to first entry
        const rep =
          items.find((i) => {
            const hour = new Date(i.dt * 1000).getUTCHours();
            return hour >= 11 && hour <= 13;
          }) ?? items[0];

        return {
          date,
          temperatureCelsius: Math.round(rep.main.temp),
          condition: rep.weather?.[0]?.description ?? 'unknown',
          humidity: rep.main.humidity,
          windSpeed: rep.wind.speed,
        };
      },
    );

    // index 0 is today, index 1 is tomorrow
    const focus = dailyForecast[1] ?? dailyForecast[0];

    return {
      city: cityName,
      temperatureCelsius: focus.temperatureCelsius,
      condition: focus.condition,
      humidity: focus.humidity,
      windSpeed: focus.windSpeed,
      dailyForecast,
    };
  }
}
