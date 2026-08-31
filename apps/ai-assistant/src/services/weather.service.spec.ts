import { firstValueFrom, of, throwError } from 'rxjs';

import { HttpService } from '@app/common/http';

import { WeatherService } from './weather.service';

describe('WeatherService', () => {
  let service: WeatherService;
  let httpGet: jest.Mock;
  let cacheTtlMs: number;
  const configService = {
    get: jest.fn((key: string) =>
      key === 'AI_WEATHER_CACHE_TTL_MS' ? cacheTtlMs : 'test-api-key',
    ),
  };

  const geocoded = (name = 'Kyiv') => of([{ name, lat: 50.45, lon: 30.52 }]);
  const forecast = () =>
    of({
      list: [
        {
          dt: 1_700_000_000,
          main: { temp: 10, humidity: 70 },
          wind: { speed: 3.2 },
          weather: [{ description: 'clear sky' }],
        },
      ],
    });

  beforeEach(() => {
    cacheTtlMs = 600000;
    httpGet = jest.fn();
    const httpService = { get: httpGet } as unknown as HttpService;
    service = new WeatherService(httpService, configService as never);
  });

  it('returns a WeatherContext for a valid city', async () => {
    httpGet
      .mockReturnValueOnce(of([{ name: 'Kyiv', lat: 50.45, lon: 30.52 }]))
      .mockReturnValueOnce(
        of({
          list: [
            {
              dt: 1_700_000_000,
              main: { temp: 10, humidity: 70 },
              wind: { speed: 3.2 },
              weather: [{ description: 'clear sky' }],
            },
            {
              dt: 1_700_086_400,
              main: { temp: 12.4, humidity: 65 },
              wind: { speed: 4.1 },
              weather: [{ description: 'light rain' }],
            },
          ],
        }),
      );

    const result = await firstValueFrom(service.getForecast('Kyiv'));

    expect(result).toMatchObject({
      city: 'Kyiv',
      temperatureCelsius: 12,
      condition: 'light rain',
      humidity: 65,
      windSpeed: 4.1,
    });
    expect(result?.dailyForecast).toHaveLength(2);
  });

  it('returns null when geocoding yields no match', async () => {
    httpGet.mockReturnValueOnce(of([]));
    const result = await firstValueFrom(service.getForecast('Nowhereville'));
    expect(result).toBeNull();
  });

  it('returns null when the weather call fails', async () => {
    httpGet
      .mockReturnValueOnce(of([{ name: 'Kyiv', lat: 50, lon: 30 }]))
      .mockReturnValueOnce(throwError(() => new Error('network down')));

    const result = await firstValueFrom(service.getForecast('Kyiv'));
    expect(result).toBeNull();
  });

  it('serves a repeated lookup for the same city from cache without re-hitting OpenWeatherMap', async () => {
    httpGet.mockReturnValueOnce(geocoded()).mockReturnValueOnce(forecast());

    const first = await firstValueFrom(service.getForecast('Kyiv'));
    const second = await firstValueFrom(service.getForecast('  kyiv '));

    expect(second).toEqual(first);
    // one geocode + one forecast, for two lookups
    expect(httpGet).toHaveBeenCalledTimes(2);
  });

  it('caches per city, so a different city is still fetched', async () => {
    httpGet
      .mockReturnValueOnce(geocoded('Kyiv'))
      .mockReturnValueOnce(forecast())
      .mockReturnValueOnce(geocoded('Lviv'))
      .mockReturnValueOnce(forecast());

    await firstValueFrom(service.getForecast('Kyiv'));
    await firstValueFrom(service.getForecast('Lviv'));

    expect(httpGet).toHaveBeenCalledTimes(4);
  });

  it('re-fetches once the configured TTL has elapsed', async () => {
    cacheTtlMs = 0;
    service = new WeatherService(
      { get: httpGet } as unknown as HttpService,
      configService as never,
    );
    httpGet
      .mockReturnValueOnce(geocoded())
      .mockReturnValueOnce(forecast())
      .mockReturnValueOnce(geocoded())
      .mockReturnValueOnce(forecast());

    await firstValueFrom(service.getForecast('Kyiv'));
    await firstValueFrom(service.getForecast('Kyiv'));

    expect(httpGet).toHaveBeenCalledTimes(4);
  });

  it('returns null when no API key is configured', async () => {
    const noKeyConfig = { get: jest.fn().mockReturnValue(undefined) };
    const svc = new WeatherService(
      { get: httpGet } as unknown as HttpService,
      noKeyConfig as never,
    );
    const result = await firstValueFrom(svc.getForecast('Kyiv'));
    expect(result).toBeNull();
    expect(httpGet).not.toHaveBeenCalled();
  });
});
