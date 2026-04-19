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

interface OneCallDaily {
  dt: number;
  temp: { day: number };
  humidity: number;
  wind_speed: number;
  weather: Array<{ description: string }>;
}

interface OneCallResponse {
  daily: OneCallDaily[];
}

const GEO_URL = 'https://api.openweathermap.org/geo/1.0/direct';
const ONE_CALL_URL = 'https://api.openweathermap.org/data/3.0/onecall';
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
          .get<OneCallResponse>(ONE_CALL_URL, {
            params: {
              lat: location.lat,
              lon: location.lon,
              appid: apiKey,
              units: 'metric',
              exclude: 'minutely,hourly,alerts,current',
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
    response: OneCallResponse,
  ): WeatherContext | null {
    if (!response?.daily?.length) {
      return null;
    }

    const dailyForecast: DayForecast[] = response.daily.map((day) => ({
      date: new Date(day.dt * 1000).toISOString().slice(0, 10),
      temperatureCelsius: Math.round(day.temp.day),
      condition: day.weather?.[0]?.description ?? 'unknown',
      humidity: day.humidity,
      windSpeed: day.wind_speed,
    }));

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
