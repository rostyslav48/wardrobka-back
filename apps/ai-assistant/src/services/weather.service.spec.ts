import { of, throwError } from 'rxjs';

import { HttpService } from '@app/common/http';

import { WeatherService } from './weather.service';

describe('WeatherService', () => {
  let service: WeatherService;
  let httpGet: jest.Mock;
  const configService = {
    get: jest.fn().mockReturnValue('test-api-key'),
  };

  beforeEach(() => {
    httpGet = jest.fn();
    const httpService = { get: httpGet } as unknown as HttpService;
    service = new WeatherService(httpService, configService as never);
  });

  it('returns a WeatherContext for a valid city', async () => {
    httpGet
      .mockReturnValueOnce(of([{ name: 'Kyiv', lat: 50.45, lon: 30.52 }]))
      .mockReturnValueOnce(
        of({
          daily: [
            {
              dt: 1_700_000_000,
              temp: { day: 10 },
              humidity: 70,
              wind_speed: 3.2,
              weather: [{ description: 'clear sky' }],
            },
            {
              dt: 1_700_086_400,
              temp: { day: 12.4 },
              humidity: 65,
              wind_speed: 4.1,
              weather: [{ description: 'light rain' }],
            },
          ],
        }),
      );

    const result = await service.getForecast('Kyiv');

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
    const result = await service.getForecast('Nowhereville');
    expect(result).toBeNull();
  });

  it('returns null when the weather call fails', async () => {
    httpGet
      .mockReturnValueOnce(of([{ name: 'Kyiv', lat: 50, lon: 30 }]))
      .mockReturnValueOnce(throwError(() => new Error('network down')));

    const result = await service.getForecast('Kyiv');
    expect(result).toBeNull();
  });

  it('returns null when no API key is configured', async () => {
    const noKeyConfig = { get: jest.fn().mockReturnValue(undefined) };
    const svc = new WeatherService(
      { get: httpGet } as unknown as HttpService,
      noKeyConfig as never,
    );
    const result = await svc.getForecast('Kyiv');
    expect(result).toBeNull();
    expect(httpGet).not.toHaveBeenCalled();
  });
});
