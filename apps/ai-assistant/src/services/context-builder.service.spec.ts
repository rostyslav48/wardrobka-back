import { NEVER, of, throwError } from 'rxjs';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

import { UserAccountEntity } from '@app/common/database/entities/auth';
import {
  OUTFIT_LOG_REQUESTS,
  SWATCHES,
  WARDROBE_PREVIEW_SELECT,
  WARDROBE_REQUESTS,
} from '@app/wardrobe/constants';

import { ContextBuilderService } from './context-builder.service';
import { WeatherService } from './weather.service';
import { getCurrentSeason } from './current-season.util';
import { WeatherContext } from '../types/weather-context.type';

const makeItem = (
  id: number,
  overrides: Partial<{ favourite: boolean; name: string; color: string }> = {},
) => ({
  id,
  name: overrides.name ?? `item-${id}`,
  type: 't-shirt',
  color: overrides.color ?? '#111111',
  season: 'spring',
  status: 'active',
  favorite: overrides.favourite ?? false,
  favourite: overrides.favourite ?? false,
});

/**
 * Projects a hand-written fixture down to what actually crosses RMQ:
 * `WardrobeService.findAll` loads only `WARDROBE_PREVIEW_SELECT`, so any field
 * outside that list arrives `undefined` however rich the entity is. Specs that
 * hand-write a full item silently pass while the wire shape is missing a field.
 */
const asWirePreview = (item: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(item).filter(([key]) =>
      (WARDROBE_PREVIEW_SELECT as string[]).includes(key),
    ),
  );

describe('ContextBuilderService — tool handlers', () => {
  const account = { id: 42, name: 'Test', email: 't@e.com' };
  let wardrobeSend: jest.Mock;
  let wardrobeClient: ClientProxy;
  let mediaSend: jest.Mock;
  let mediaClient: ClientProxy;
  let accountRepo: { findOne: jest.Mock };
  let weatherService: { getForecast: jest.Mock };
  let configValues: Record<string, unknown>;
  let service: ContextBuilderService;

  const build = () =>
    new ContextBuilderService(
      wardrobeClient,
      mediaClient,
      accountRepo as unknown as Repository<UserAccountEntity>,
      weatherService as unknown as WeatherService,
      {
        get: (key: string, fallback?: unknown) =>
          key in configValues ? configValues[key] : fallback,
      } as unknown as ConfigService,
    );

  beforeEach(() => {
    wardrobeSend = jest.fn();
    wardrobeClient = { send: wardrobeSend } as unknown as ClientProxy;
    mediaSend = jest.fn();
    mediaClient = { send: mediaSend } as unknown as ClientProxy;
    accountRepo = { findOne: jest.fn() };
    weatherService = { getForecast: jest.fn() };
    configValues = {};
    service = build();
  });

  describe('search_wardrobe', () => {
    it('returns compact rows carrying the item id, plus total and truncated', async () => {
      wardrobeSend.mockReturnValue(of([makeItem(1), makeItem(2)]));

      const result = await service.executeTool(
        'search_wardrobe',
        { type: 't-shirt' },
        account,
      );

      expect(result).toEqual({
        items: [
          {
            id: 1,
            name: 'item-1',
            type: 't-shirt',
            color: 'Black',
            season: 'spring',
            status: 'active',
          },
          {
            id: 2,
            name: 'item-2',
            type: 't-shirt',
            color: 'Black',
            season: 'spring',
            status: 'active',
          },
        ],
        total: 2,
        truncated: false,
      });
    });

    it('signals truncation with the true total when the result set exceeds the row cap', async () => {
      configValues.AI_TOOL_ROW_LIMIT = 3;
      service = build();
      wardrobeSend.mockReturnValue(
        of(Array.from({ length: 40 }, (_, i) => makeItem(i + 1))),
      );

      const result = (await service.executeTool(
        'search_wardrobe',
        {},
        account,
      )) as { items: unknown[]; total: number; truncated: boolean };

      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(40);
      expect(result.truncated).toBe(true);
    });

    it('never returns more than the row cap even when the model asks for more', async () => {
      configValues.AI_TOOL_ROW_LIMIT = 2;
      service = build();
      wardrobeSend.mockReturnValue(
        of(Array.from({ length: 10 }, (_, i) => makeItem(i + 1))),
      );

      const result = (await service.executeTool(
        'search_wardrobe',
        { limit: 500 },
        account,
      )) as { items: unknown[]; truncated: boolean };

      expect(result.items).toHaveLength(2);
      expect(result.truncated).toBe(true);
    });

    it('maps a swatch label to the exact stored hex through SWATCHES', async () => {
      wardrobeSend.mockReturnValue(of([]));

      await service.executeTool('search_wardrobe', { color: 'Navy' }, account);

      const navyHex = SWATCHES.find((s) => s.label === 'Navy')?.hex;
      expect(wardrobeSend).toHaveBeenCalledWith(WARDROBE_REQUESTS.findMany, {
        data: { color: navyHex },
        user: account,
      });
    });

    it('accepts a valid label that matches nothing in the wardrobe and returns an empty result', async () => {
      wardrobeSend.mockReturnValue(of([]));

      const result = await service.executeTool(
        'search_wardrobe',
        { color: 'Purple' },
        account,
      );

      expect(result).toEqual({ items: [], total: 0, truncated: false });
    });

    it('rejects a colour outside the palette without hitting the wardrobe service', async () => {
      const result = (await service.executeTool(
        'search_wardrobe',
        { color: 'chartreuse' },
        account,
      )) as { error: string };

      expect(result.error).toContain('chartreuse');
      expect(wardrobeSend).not.toHaveBeenCalled();
    });

    it('binds accountId server-side and ignores one supplied by the model', async () => {
      wardrobeSend.mockReturnValue(of([]));

      await service.executeTool(
        'search_wardrobe',
        { accountId: 999, type: 'jacket' },
        account,
      );

      expect(wardrobeSend).toHaveBeenCalledWith(WARDROBE_REQUESTS.findMany, {
        data: { type: 'jacket' },
        user: account,
      });
    });

    it('returns an error result rather than throwing when the RPC fails', async () => {
      wardrobeSend.mockReturnValue(throwError(() => new Error('rmq down')));

      const result = (await service.executeTool(
        'search_wardrobe',
        {},
        account,
      )) as { error: string };

      expect(result.error).toContain('rmq down');
    });
  });

  describe('get_item_details', () => {
    it('fetches full records by id, scoped to the account', async () => {
      wardrobeSend.mockReturnValue(of([makeItem(3)]));

      const result = (await service.executeTool(
        'get_item_details',
        { ids: [3] },
        account,
      )) as { items: unknown[]; total: number };

      expect(wardrobeSend).toHaveBeenCalledWith(
        WARDROBE_REQUESTS.findManyByIds,
        { data: [3], user: account },
      );
      expect(result.total).toBe(1);
    });

    it('returns an empty result for no ids without calling the wardrobe service', async () => {
      const result = await service.executeTool(
        'get_item_details',
        { ids: [] },
        account,
      );

      expect(result).toEqual({ items: [], total: 0, truncated: false });
      expect(wardrobeSend).not.toHaveBeenCalled();
    });

    it('returns an error result rather than throwing when the RPC fails', async () => {
      wardrobeSend.mockReturnValue(throwError(() => new Error('rmq down')));

      const result = (await service.executeTool(
        'get_item_details',
        { ids: [1] },
        account,
      )) as { error: string };

      expect(result.error).toContain('rmq down');
    });
  });

  describe('get_weather', () => {
    const weather: WeatherContext = {
      city: 'Kyiv',
      temperatureCelsius: 10,
      condition: 'clear',
      humidity: 55,
      windSpeed: 3,
      dailyForecast: [
        {
          date: '2026-01-01',
          temperatureCelsius: 1,
          condition: 'snow',
          humidity: 80,
          windSpeed: 2,
        },
        {
          date: '2026-01-02',
          temperatureCelsius: 2,
          condition: 'snow',
          humidity: 80,
          windSpeed: 2,
        },
        {
          date: '2026-01-03',
          temperatureCelsius: 3,
          condition: 'snow',
          humidity: 80,
          windSpeed: 2,
        },
      ],
    };

    it('returns the forecast for the account city', async () => {
      accountRepo.findOne.mockResolvedValue({ id: 42, city: 'Kyiv' });
      weatherService.getForecast.mockReturnValue(of(weather));

      const result = (await service.executeTool(
        'get_weather',
        {},
        account,
      )) as { weather: WeatherContext };

      expect(weatherService.getForecast).toHaveBeenCalledWith('Kyiv');
      expect(result.weather).toEqual(weather);
    });

    it('trims the daily forecast to the requested number of days', async () => {
      accountRepo.findOne.mockResolvedValue({ id: 42, city: 'Kyiv' });
      weatherService.getForecast.mockReturnValue(of(weather));

      const result = (await service.executeTool(
        'get_weather',
        { days: 2 },
        account,
      )) as { weather: WeatherContext };

      expect(result.weather.dailyForecast).toHaveLength(2);
    });

    it('reports no forecast, without an error, when the account has no city', async () => {
      accountRepo.findOne.mockResolvedValue({ id: 42, city: null });

      const result = (await service.executeTool(
        'get_weather',
        {},
        account,
      )) as {
        weather: null;
        note: string;
      };

      expect(result.weather).toBeNull();
      expect(result.note).toContain('no city');
      expect(weatherService.getForecast).not.toHaveBeenCalled();
    });
  });

  describe('get_recent_outfits', () => {
    it('resolves logged item ids to names, scoped to the account', async () => {
      wardrobeSend.mockImplementation((pattern: string) =>
        pattern === OUTFIT_LOG_REQUESTS.findMany
          ? of([{ date: Date.UTC(2026, 0, 5), wardrobeItemIds: [1] }])
          : of([makeItem(1, { name: 'navy blazer' })]),
      );

      const result = (await service.executeTool(
        'get_recent_outfits',
        { limit: 3 },
        account,
      )) as { outfits: { date: string; itemNames: string[] }[]; total: number };

      expect(wardrobeSend).toHaveBeenCalledWith(OUTFIT_LOG_REQUESTS.findMany, {
        data: { limit: 3 },
        user: account,
      });
      expect(result.outfits).toEqual([
        { date: '2026-01-05', itemNames: ['navy blazer'] },
      ]);
      expect(result.total).toBe(1);
    });

    it('returns an empty list when there are no logs', async () => {
      wardrobeSend.mockReturnValue(of([]));

      const result = await service.executeTool(
        'get_recent_outfits',
        {},
        account,
      );

      expect(result).toEqual({ outfits: [], total: 0 });
    });

    it('returns an empty list rather than throwing when the RPC fails', async () => {
      wardrobeSend.mockReturnValue(throwError(() => new Error('rmq down')));

      const result = await service.executeTool(
        'get_recent_outfits',
        {},
        account,
      );

      expect(result).toEqual({ outfits: [], total: 0 });
    });
  });

  describe('propose_outfit', () => {
    it('accepts ids that all belong to the account', async () => {
      wardrobeSend.mockReturnValue(of([makeItem(1), makeItem(2)]));

      const result = await service.executeTool(
        'propose_outfit',
        {
          summary: 'Navy blazer with chinos',
          itemIds: [1, 2],
          rationale: 'mild weather',
        },
        account,
      );

      expect(wardrobeSend).toHaveBeenCalledWith(
        WARDROBE_REQUESTS.findManyByIds,
        {
          data: [1, 2],
          user: account,
        },
      );
      expect(result).toEqual({
        ok: true,
        summary: 'Navy blazer with chinos',
        rationale: 'mild weather',
        itemIds: [1, 2],
      });
    });

    it('rejects an id that does not belong to the account, without a silent partial success', async () => {
      // findManyByIds is itself account-scoped, so a foreign id of 99 simply
      // never comes back — that absence is what the handler treats as rejection.
      wardrobeSend.mockReturnValue(of([makeItem(1)]));

      const result = (await service.executeTool(
        'propose_outfit',
        { summary: 'Outfit', itemIds: [1, 99], rationale: 'reason' },
        account,
      )) as { error: string };

      expect(result.error).toContain('99');
      expect(result.error).not.toContain('ok');
    });

    it('rejects an empty itemIds array before calling the wardrobe service', async () => {
      const result = (await service.executeTool(
        'propose_outfit',
        { summary: 'Outfit', itemIds: [], rationale: 'reason' },
        account,
      )) as { error: string };

      expect(result.error).toBeDefined();
      expect(wardrobeSend).not.toHaveBeenCalled();
    });

    it('rejects a blank summary before calling the wardrobe service', async () => {
      const result = (await service.executeTool(
        'propose_outfit',
        { summary: '   ', itemIds: [1], rationale: 'reason' },
        account,
      )) as { error: string };

      expect(result.error).toBeDefined();
      expect(wardrobeSend).not.toHaveBeenCalled();
    });

    it('de-duplicates repeated item ids', async () => {
      wardrobeSend.mockReturnValue(of([makeItem(1)]));

      const result = (await service.executeTool(
        'propose_outfit',
        { summary: 'Outfit', itemIds: [1, 1], rationale: 'reason' },
        account,
      )) as { itemIds: number[] };

      expect(result.itemIds).toEqual([1]);
    });

    it('returns an error result rather than throwing when the ownership-check RPC fails', async () => {
      wardrobeSend.mockReturnValue(throwError(() => new Error('rmq down')));

      const result = (await service.executeTool(
        'propose_outfit',
        { summary: 'Outfit', itemIds: [1], rationale: 'reason' },
        account,
      )) as { error: string };

      expect(result.error).toContain('rmq down');
    });
  });

  describe('RPC timeout', () => {
    it('resolves search_wardrobe to an error result, not a hang, when the wardrobe service never responds', async () => {
      configValues.AI_TOOL_RPC_TIMEOUT_MS = 20;
      service = build();
      wardrobeSend.mockReturnValue(NEVER);

      const result = (await service.executeTool(
        'search_wardrobe',
        {},
        account,
      )) as { error: string };

      expect(result.error).toBeDefined();
    });

    it('resolves propose_outfit to an error result, not a hang, when the ownership-check RPC never responds', async () => {
      configValues.AI_TOOL_RPC_TIMEOUT_MS = 20;
      service = build();
      wardrobeSend.mockReturnValue(NEVER);

      const result = (await service.executeTool(
        'propose_outfit',
        { summary: 'Outfit', itemIds: [1], rationale: 'reason' },
        account,
      )) as { error: string };

      expect(result.error).toBeDefined();
    });

    it('resolves get_recent_outfits to an empty list, not a hang, when the wardrobe service never responds', async () => {
      configValues.AI_TOOL_RPC_TIMEOUT_MS = 20;
      service = build();
      wardrobeSend.mockReturnValue(NEVER);

      const result = await service.executeTool(
        'get_recent_outfits',
        {},
        account,
      );

      expect(result).toEqual({ outfits: [], total: 0 });
    });
  });

  describe('fetchReferenceImageUrls', () => {
    it('resolves item paths to signed urls, in the order the keys were given', async () => {
      mediaSend.mockReturnValue(
        of({ 0: 'https://cdn/a.jpg', 1: 'https://cdn/b.jpg' }),
      );

      const result = await service.fetchReferenceImageUrls(['a', 'b']);

      expect(result).toEqual(['https://cdn/a.jpg', 'https://cdn/b.jpg']);
    });

    it('returns an empty array rather than throwing when the media-storage RPC fails', async () => {
      mediaSend.mockReturnValue(throwError(() => new Error('rmq down')));

      const result = await service.fetchReferenceImageUrls(['a']);

      expect(result).toEqual([]);
    });

    it('returns an empty array, not a hang, when the media-storage service never responds', async () => {
      configValues.AI_TOOL_RPC_TIMEOUT_MS = 20;
      service = build();
      mediaSend.mockReturnValue(NEVER);

      const result = await service.fetchReferenceImageUrls(['a']);

      expect(result).toEqual([]);
    });
  });

  it('reports an unknown tool name back to the model instead of throwing', async () => {
    const result = (await service.executeTool(
      'drop_wardrobe',
      {},
      account,
    )) as {
      error: string;
    };

    expect(result.error).toContain('drop_wardrobe');
  });
});

describe('ContextBuilderService — buildSeedSummary', () => {
  const account = { id: 42, name: 'Test', email: 't@e.com' };
  let wardrobeSend: jest.Mock;
  let accountRepo: { findOne: jest.Mock };
  let service: ContextBuilderService;

  beforeEach(() => {
    wardrobeSend = jest.fn();
    accountRepo = { findOne: jest.fn() };
    service = new ContextBuilderService(
      { send: wardrobeSend } as unknown as ClientProxy,
      { send: jest.fn() } as unknown as ClientProxy,
      accountRepo as unknown as Repository<UserAccountEntity>,
      { getForecast: jest.fn() } as unknown as WeatherService,
      {
        get: (_: string, fallback?: unknown) => fallback,
      } as unknown as ConfigService,
    );
  });

  it('reports counts by type and status, the account city and the season as a hint', async () => {
    accountRepo.findOne.mockResolvedValue({ id: 42, city: 'Lviv' });
    wardrobeSend.mockReturnValue(
      of([
        { id: 1, type: 'jacket', status: 'active' },
        { id: 2, type: 'jacket', status: 'washing' },
        { id: 3, type: 'jeans', status: 'active' },
      ]),
    );

    const summary = await service.buildSeedSummary(account);

    expect(summary).toContain('Total items: 3');
    expect(summary).toContain('By type: jacket 2, jeans 1');
    expect(summary).toContain('By status: active 2, washing 1');
    expect(summary).toContain('Account city: Lviv');
    expect(summary).toContain(`Calendar season hint: ${getCurrentSeason()}`);
    expect(summary).toContain('not a filter');
  });

  it('still produces a summary when the wardrobe service is unreachable', async () => {
    accountRepo.findOne.mockResolvedValue({ id: 42, city: null });
    wardrobeSend.mockReturnValue(throwError(() => new Error('rmq down')));

    const summary = await service.buildSeedSummary(account);

    expect(summary).toContain('Total items: 0');
    expect(summary).toContain('Account city: not set');
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
      {
        get: (_: string, fallback?: unknown) => fallback,
      } as unknown as ConfigService,
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

  it('sniffs mimeType from magic bytes when content-type is a non-image type', async () => {
    fetchMock.mockResolvedValue(
      okResponse(pngBytes, { 'content-type': 'application/octet-stream' }),
    );

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

describe('ContextBuilderService — pinned to the findAll select list', () => {
  const account = { id: 42, name: 'Test', email: 't@e.com' };
  let wardrobeSend: jest.Mock;
  let accountRepo: { findOne: jest.Mock };
  let service: ContextBuilderService;

  beforeEach(() => {
    wardrobeSend = jest.fn();
    accountRepo = { findOne: jest.fn() };
    service = new ContextBuilderService(
      { send: wardrobeSend } as unknown as ClientProxy,
      { send: jest.fn() } as unknown as ClientProxy,
      accountRepo as unknown as Repository<UserAccountEntity>,
      { getForecast: jest.fn() } as unknown as WeatherService,
      {
        get: (_: string, fallback?: unknown) => fallback,
      } as unknown as ConfigService,
    );
  });

  it('populates every search_wardrobe row field from a column findAll selects', async () => {
    wardrobeSend.mockReturnValue(
      of([
        asWirePreview({
          id: 7,
          name: 'Navy Blazer',
          type: 'jacket',
          color: '#1B2A4A',
          season: 'winter',
          status: 'washing',
          size: 'm',
          favourite: false,
        }),
      ]),
    );

    const result = (await service.executeTool(
      'search_wardrobe',
      {},
      account,
    )) as { items: Record<string, unknown>[] };
    const [row] = result.items;

    // Every key the row exposes must come from a selected column, and must
    // carry a real value — `status: null` is exactly the drift this pins.
    for (const [key, value] of Object.entries(row)) {
      expect(WARDROBE_PREVIEW_SELECT).toContain(key);
      expect(value).not.toBeNull();
    }

    expect(row).toEqual({
      id: 7,
      name: 'Navy Blazer',
      type: 'jacket',
      color: 'Navy',
      season: 'winter',
      status: 'washing',
    });
  });

  it('counts by status in the seed summary from a column findAll selects', async () => {
    accountRepo.findOne.mockResolvedValue({ id: 42, city: 'Lviv' });
    wardrobeSend.mockReturnValue(
      of([
        asWirePreview({ id: 1, type: 'jacket', status: 'washing' }),
        asWirePreview({ id: 2, type: 'jeans', status: 'active' }),
      ]),
    );

    const summary = await service.buildSeedSummary(account);
    const statusLine = summary
      .split('\n')
      .find((line) => line.startsWith('- By status:'));

    expect(statusLine).toContain('washing 1');
    expect(statusLine).toContain('active 1');
    expect(statusLine).not.toContain('none');
  });
});
