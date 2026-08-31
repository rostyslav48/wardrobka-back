import { RequestTimeoutException } from '@nestjs/common';

const generateContentMock = jest.fn();

jest.mock('@google/genai', () => ({
  ...jest.requireActual('@google/genai'),
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
}));

import { ImageAnalyzerService } from './image-analyzer.service';
import { SWATCHES } from '@app/wardrobe/constants';
import { FitType, ItemType, Season, Size } from '@app/wardrobe/enums';

describe('ImageAnalyzerService', () => {
  const configValues: Record<string, unknown> = {
    GEMINI_MODEL: 'gemini-2.5-flash',
  };
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('test-api-key'),
    get: jest.fn((key: string, fallback?: unknown) =>
      key in configValues ? configValues[key] : fallback,
    ),
  };

  let service: ImageAnalyzerService;

  const jsonResponse = (payload: Record<string, unknown>) => ({
    text: JSON.stringify(payload),
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    configService.getOrThrow.mockReturnValue('test-api-key');
    service = new ImageAnalyzerService(configService as never);
  });

  it('sends the image as inline data alongside the analysis prompt', async () => {
    generateContentMock.mockResolvedValue(
      jsonResponse({
        type: ItemType.TShirt,
        color: 'Navy',
        season: Season.Summer,
        size: Size.M,
        fit_type: FitType.Regular,
      }),
    );

    await service.analyze('base64-bytes', 'image/jpeg');

    const call = generateContentMock.mock.calls[0][0];
    expect(call.contents[0].parts).toEqual(
      expect.arrayContaining([
        { inlineData: { mimeType: 'image/jpeg', data: 'base64-bytes' } },
      ]),
    );
    expect(call.config.responseMimeType).toBe('application/json');
  });

  it('constrains the response schema to the wardrobe enums and swatch labels', async () => {
    generateContentMock.mockResolvedValue(jsonResponse({}));

    await service.analyze('base64-bytes', 'image/jpeg');

    const { config } = generateContentMock.mock.calls[0][0];
    const { properties, required } = config.responseSchema;

    expect(properties.type.enum).toEqual(Object.values(ItemType));
    expect(properties.season.enum).toEqual(Object.values(Season));
    expect(properties.size.enum).toEqual(Object.values(Size));
    expect(properties.fit_type.enum).toEqual(Object.values(FitType));
    expect(properties.color.enum).toEqual(SWATCHES.map((s) => s.label));
    expect(required).toEqual(['type', 'color', 'season', 'size', 'fit_type']);
  });

  it('passes an AbortSignal deadline to the Gemini call', async () => {
    generateContentMock.mockResolvedValue(jsonResponse({}));

    await service.analyze('base64-bytes', 'image/jpeg');

    const { config } = generateContentMock.mock.calls[0][0];
    expect(config.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('maps a mocked Gemini response to valid constrained attributes', async () => {
    generateContentMock.mockResolvedValue(
      jsonResponse({
        type: ItemType.Jacket,
        color: 'Navy',
        season: Season.Winter,
        size: Size.L,
        fit_type: FitType.Slim,
        name: 'Navy blazer',
        brand: 'Uniqlo',
        material: 'Wool blend',
        style: 'Smart casual',
        description: 'A single-breasted navy blazer.',
      }),
    );

    const result = await service.analyze('base64-bytes', 'image/jpeg');

    expect(result).toEqual({
      type: ItemType.Jacket,
      color: '#1B2A4A',
      season: Season.Winter,
      size: Size.L,
      fit_type: FitType.Slim,
      name: 'Navy blazer',
      brand: 'Uniqlo',
      material: 'Wool blend',
      style: 'Smart casual',
      description: 'A single-breasted navy blazer.',
    });
  });

  it('maps the colour label to its exact swatch hex', async () => {
    generateContentMock.mockResolvedValue(
      jsonResponse({
        type: ItemType.TShirt,
        color: 'Purple',
        season: Season.Summer,
        size: Size.S,
        fit_type: FitType.Regular,
      }),
    );

    const result = await service.analyze('base64-bytes', 'image/jpeg');

    expect(result.color).toBe(SWATCHES.find((s) => s.label === 'Purple')?.hex);
  });

  it('omits optional fields the model did not return, rather than inventing them', async () => {
    generateContentMock.mockResolvedValue(
      jsonResponse({
        type: ItemType.TShirt,
        color: 'Black',
        season: Season.Summer,
        size: Size.M,
        fit_type: FitType.Regular,
      }),
    );

    const result = await service.analyze('base64-bytes', 'image/jpeg');

    expect(result.name).toBeUndefined();
    expect(result.brand).toBeUndefined();
    expect(result.material).toBeUndefined();
    expect(result.style).toBeUndefined();
    expect(result.description).toBeUndefined();
  });

  it('drops a colour outside the palette instead of returning a bad value', async () => {
    generateContentMock.mockResolvedValue(
      jsonResponse({
        type: ItemType.TShirt,
        color: 'Chartreuse',
        season: Season.Summer,
        size: Size.M,
        fit_type: FitType.Regular,
      }),
    );

    const result = await service.analyze('base64-bytes', 'image/jpeg');

    expect(result.color).toBeUndefined();
  });

  it('drops an enum value outside the allowed set instead of returning it', async () => {
    generateContentMock.mockResolvedValue(
      jsonResponse({
        type: 'spacesuit',
        color: 'Black',
        season: Season.Summer,
        size: Size.M,
        fit_type: FitType.Regular,
      }),
    );

    const result = await service.analyze('base64-bytes', 'image/jpeg');

    expect(result.type).toBeUndefined();
    expect(result.color).toBe('#111111');
  });

  it('treats blank optional strings as not detected', async () => {
    generateContentMock.mockResolvedValue(
      jsonResponse({
        type: ItemType.TShirt,
        color: 'Black',
        season: Season.Summer,
        size: Size.M,
        fit_type: FitType.Regular,
        name: '   ',
      }),
    );

    const result = await service.analyze('base64-bytes', 'image/jpeg');

    expect(result.name).toBeUndefined();
  });

  it('handles malformed (non-JSON) model output without throwing', async () => {
    generateContentMock.mockResolvedValue({
      text: 'not valid json {{{',
      usageMetadata: {},
    });

    const result = await service.analyze('base64-bytes', 'image/jpeg');

    expect(result).toEqual({});
  });

  it('handles a JSON array response (not an object) without throwing', async () => {
    generateContentMock.mockResolvedValue({
      text: '[1, 2, 3]',
      usageMetadata: {},
    });

    const result = await service.analyze('base64-bytes', 'image/jpeg');

    expect(result).toEqual({});
  });

  it('handles an empty response without throwing', async () => {
    generateContentMock.mockResolvedValue({ text: '', usageMetadata: {} });

    const result = await service.analyze('base64-bytes', 'image/jpeg');

    expect(result).toEqual({});
  });

  it('surfaces a timeout as RequestTimeoutException instead of hanging', async () => {
    generateContentMock.mockRejectedValue(
      Object.assign(new Error('The operation was aborted due to timeout'), {
        name: 'TimeoutError',
      }),
    );

    await expect(
      service.analyze('base64-bytes', 'image/jpeg'),
    ).rejects.toBeInstanceOf(RequestTimeoutException);
  });

  it('propagates a non-timeout Gemini failure as-is', async () => {
    generateContentMock.mockRejectedValue(new Error('quota exceeded'));

    await expect(service.analyze('base64-bytes', 'image/jpeg')).rejects.toThrow(
      'quota exceeded',
    );
  });
});
