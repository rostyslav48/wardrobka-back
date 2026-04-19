import { of } from 'rxjs';
import { ClientProxy } from '@nestjs/microservices';
import { Repository } from 'typeorm';

import { UserAccountEntity } from '@app/common/database/entities/auth';

import { ContextBuilderService } from './context-builder.service';
import { WeatherService } from './weather.service';
import { WeatherContext } from '../types/weather-context.type';

const makeItem = (
  id: number,
  overrides: Partial<{ favourite: boolean; name: string }> = {},
) => ({
  id,
  name: overrides.name ?? `item-${id}`,
  type: 't-shirt',
  color: 'black',
  season: 'spring',
  status: 'active',
  favorite: overrides.favourite ?? false,
  favourite: overrides.favourite ?? false,
});

describe('ContextBuilderService', () => {
  const account = { id: 42, name: 'Test', email: 't@e.com' };
  let wardrobeSend: jest.Mock;
  let wardrobeClient: ClientProxy;
  let mediaClient: ClientProxy;
  let accountRepo: { findOne: jest.Mock };
  let weatherService: { getForecast: jest.Mock };
  let service: ContextBuilderService;

  beforeEach(() => {
    wardrobeSend = jest.fn();
    wardrobeClient = { send: wardrobeSend } as unknown as ClientProxy;
    mediaClient = { send: jest.fn() } as unknown as ClientProxy;
    accountRepo = { findOne: jest.fn() };
    weatherService = { getForecast: jest.fn() };
    service = new ContextBuilderService(
      wardrobeClient,
      mediaClient,
      accountRepo as unknown as Repository<UserAccountEntity>,
      weatherService as unknown as WeatherService,
    );
  });

  it('returns weather and active items when everything is available', async () => {
    const weather: WeatherContext = {
      city: 'Kyiv',
      temperatureCelsius: 10,
      condition: 'clear',
      humidity: 55,
      windSpeed: 3,
      dailyForecast: [],
    };

    accountRepo.findOne.mockResolvedValue({ id: 42, city: 'Kyiv' });
    weatherService.getForecast.mockReturnValue(of(weather));
    wardrobeSend.mockReturnValue(of([makeItem(1), makeItem(2)]));

    const result = await service.buildContext(account, {});

    expect(result.weather).toEqual(weather);
    expect(result.activeWardrobeItems).toHaveLength(2);
    expect(weatherService.getForecast).toHaveBeenCalledWith('Kyiv');
  });

  it('caps active items at 50 with favourites selected first', async () => {
    const items = [
      ...Array.from({ length: 10 }, (_, i) =>
        makeItem(i + 1, { favourite: true }),
      ),
      ...Array.from({ length: 100 }, (_, i) => makeItem(i + 100)),
    ];

    accountRepo.findOne.mockResolvedValue({ id: 42, city: null });
    wardrobeSend.mockReturnValue(of(items));

    const result = await service.buildContext(account, {});

    expect(result.activeWardrobeItems).toHaveLength(50);
    const favouriteCount = result.activeWardrobeItems.filter(
      (it) => it.favourite,
    ).length;
    expect(favouriteCount).toBe(10);
  });

  it('omits weather when city is null', async () => {
    accountRepo.findOne.mockResolvedValue({ id: 42, city: null });
    wardrobeSend.mockReturnValue(of([]));

    const result = await service.buildContext(account, {});

    expect(result.weather).toBeNull();
    expect(weatherService.getForecast).not.toHaveBeenCalled();
  });

  it('omits weather when WeatherService returns null', async () => {
    accountRepo.findOne.mockResolvedValue({ id: 42, city: 'Kyiv' });
    weatherService.getForecast.mockReturnValue(of(null));
    wardrobeSend.mockReturnValue(of([]));

    const result = await service.buildContext(account, {});
    expect(result.weather).toBeNull();
  });

  it('returns empty active items when wardrobe has none', async () => {
    accountRepo.findOne.mockResolvedValue({ id: 42, city: null });
    wardrobeSend.mockReturnValue(of([]));

    const result = await service.buildContext(account, {});
    expect(result.activeWardrobeItems).toEqual([]);
  });
});
