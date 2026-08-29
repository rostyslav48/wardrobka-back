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

describe('ContextBuilderService — fetchReferenceImageParts', () => {
  let wardrobeClient: ClientProxy;
  let mediaClient: ClientProxy;
  let accountRepo: { findOne: jest.Mock };
  let weatherService: { getForecast: jest.Mock };
  let service: ContextBuilderService;
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3]);
  const pngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
  ]);

  beforeEach(() => {
    wardrobeClient = { send: jest.fn() } as unknown as ClientProxy;
    mediaClient = { send: jest.fn() } as unknown as ClientProxy;
    accountRepo = { findOne: jest.fn() };
    weatherService = { getForecast: jest.fn() };
    service = new ContextBuilderService(
      wardrobeClient,
      mediaClient,
      accountRepo as unknown as Repository<UserAccountEntity>,
      weatherService as unknown as WeatherService,
    );
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const okResponse = (body: Buffer, headers: Record<string, string> = {}) => ({
    ok: true,
    status: 200,
    headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
    arrayBuffer: async () =>
      body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  });

  it('attaches images as base64 with mimeType read from content-type', async () => {
    fetchMock.mockResolvedValue(
      okResponse(jpegBytes, { 'content-type': 'image/jpeg' }),
    );

    const result = await service.fetchReferenceImageParts([
      'https://signed.example.com/a.jpg',
    ]);

    expect(result).toEqual([
      { mimeType: 'image/jpeg', data: jpegBytes.toString('base64') },
    ]);
  });

  it('sniffs mimeType from magic bytes when content-type is missing', async () => {
    fetchMock.mockResolvedValue(okResponse(pngBytes));

    const result = await service.fetchReferenceImageParts([
      'https://signed.example.com/a.png',
    ]);

    expect(result[0].mimeType).toBe('image/png');
  });

  it('caps at 5 images and never fetches more than that', async () => {
    fetchMock.mockResolvedValue(
      okResponse(jpegBytes, { 'content-type': 'image/jpeg' }),
    );
    const urls = Array.from(
      { length: 8 },
      (_, i) => `https://signed.example.com/${i}.jpg`,
    );

    const result = await service.fetchReferenceImageParts(urls);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(result).toHaveLength(5);
  });

  it('skips a failed fetch with a warning and never throws', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    const result = await service.fetchReferenceImageParts([
      'https://signed.example.com/missing.jpg',
    ]);

    expect(result).toEqual([]);
  });

  it('skips an oversized image with a warning', async () => {
    const bigBuffer = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(11 * 1024 * 1024),
    ]);
    fetchMock.mockResolvedValue(
      okResponse(bigBuffer, { 'content-type': 'image/jpeg' }),
    );

    const result = await service.fetchReferenceImageParts([
      'https://signed.example.com/huge.jpg',
    ]);

    expect(result).toEqual([]);
  });

  it('never aborts the whole call when one of several fetches fails', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce(
        okResponse(jpegBytes, { 'content-type': 'image/jpeg' }),
      );

    const result = await service.fetchReferenceImageParts([
      'https://signed.example.com/broken.jpg',
      'https://signed.example.com/ok.jpg',
    ]);

    expect(result).toEqual([
      { mimeType: 'image/jpeg', data: jpegBytes.toString('base64') },
    ]);
  });

  it('skips a fetch that times out (AbortError) with a warning and never hangs or throws', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error('The operation was aborted'), {
        name: 'AbortError',
      }),
    );

    const result = await service.fetchReferenceImageParts([
      'https://signed.example.com/never-responds.jpg',
    ]);

    expect(result).toEqual([]);
  });

  it('passes an AbortSignal with a bounded timeout to every fetch', async () => {
    fetchMock.mockResolvedValue(okResponse(pngBytes));

    await service.fetchReferenceImageParts([
      'https://signed.example.com/one.png',
    ]);

    const [, options] = fetchMock.mock.calls[0];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns an empty array when no urls are given', async () => {
    const result = await service.fetchReferenceImageParts([]);
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
