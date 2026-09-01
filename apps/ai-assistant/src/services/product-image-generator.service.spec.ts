const generateContentMock = jest.fn();

jest.mock('@google/genai', () => ({
  ...jest.requireActual('@google/genai'),
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
}));

import { Modality } from '@google/genai';

import { ProductImageGeneratorService } from './product-image-generator.service';
import { ImageStatus } from '@app/wardrobe/enums';

describe('ProductImageGeneratorService', () => {
  const configValues: Record<string, unknown> = {
    GEMINI_IMAGE_MODEL: 'gemini-3.1-flash-image',
    GEMINI_IMAGE_TIMEOUT_MS: 60000,
  };
  const configService = {
    getOrThrow: jest.fn((key: string) =>
      key === 'USER_IMAGES_FOLDER_PATH' ? 'user-images' : 'test-api-key',
    ),
    get: jest.fn((key: string, fallback?: unknown) =>
      key in configValues ? configValues[key] : fallback,
    ),
  };

  const mediaStorageService = {
    getUrls: jest.fn(),
    store: jest.fn(),
    delete: jest.fn(),
  };

  const input = {
    itemId: 42,
    accountId: 7,
    tempImageKey: 'tmp/7/original.jpg',
    originalName: 'photo.jpg',
  };

  const imageResponse = (data: string, mimeType = 'image/png') => ({
    candidates: [{ content: { parts: [{ inlineData: { mimeType, data } }] } }],
  });

  const okDownload = (bytes = 'original-bytes', contentType = 'image/jpeg') => ({
    ok: true,
    status: 200,
    headers: { get: () => contentType },
    arrayBuffer: async () => Buffer.from(bytes),
  });

  let service: ProductImageGeneratorService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn().mockResolvedValue(okDownload());
    global.fetch = fetchMock as unknown as typeof fetch;

    mediaStorageService.getUrls.mockResolvedValue({
      42: 'https://s3.example/signed-original',
    });
    mediaStorageService.store.mockResolvedValue(
      'user-images/7/generated-uuid.png',
    );

    service = new ProductImageGeneratorService(
      configService as never,
      mediaStorageService as never,
    );
  });

  it('reports ready with the stored reference after uploading the generated image', async () => {
    generateContentMock.mockResolvedValue(imageResponse('generated-bytes'));

    const result = await service.generate(input);

    expect(result).toEqual({
      status: ImageStatus.Ready,
      imgPath: 'user-images/7/generated-uuid.png',
    });
    expect(mediaStorageService.store).toHaveBeenCalledWith(
      { originalname: 'product-image.png', fileBase64: 'generated-bytes' },
      'user-images/7',
    );
  });

  it('resolves the original through a signed URL for the temp key, never over the message bus', async () => {
    generateContentMock.mockResolvedValue(imageResponse('generated-bytes'));

    await service.generate(input);

    expect(mediaStorageService.getUrls).toHaveBeenCalledWith([
      { id: 42, path: 'tmp/7/original.jpg' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://s3.example/signed-original',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('sends the downloaded original as inline data and asks only for an image back', async () => {
    generateContentMock.mockResolvedValue(imageResponse('generated-bytes'));

    await service.generate(input);

    const call = generateContentMock.mock.calls[0][0];
    expect(call.model).toBe('gemini-3.1-flash-image');
    expect(call.contents[0].parts).toEqual(
      expect.arrayContaining([
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: Buffer.from('original-bytes').toString('base64'),
          },
        },
      ]),
    );
    expect(call.config.responseModalities).toEqual([Modality.IMAGE]);
    expect(call.config.abortSignal).toBeInstanceOf(AbortSignal);
  });

  // Phase 0 decision: straighten-plus-cutout, never canonical re-angling. Both
  // halves are asserted — an earlier wording carried the "no re-angling" half
  // so forcefully that the model skipped straightening too, which no mocked
  // assertion on the negative alone would have caught.
  it('instructs the model to remove the background, straighten in-plane and keep the photographed viewpoint', async () => {
    generateContentMock.mockResolvedValue(imageResponse('generated-bytes'));

    await service.generate(input);

    const prompt = generateContentMock.mock.calls[0][0].contents[0].parts[0]
      .text as string;
    expect(prompt).toMatch(/remove the background/i);
    expect(prompt).toMatch(/white background/i);
    expect(prompt).toMatch(/rotate it within the picture plane/i);
    expect(prompt).toMatch(/do not move the camera to a different angle/i);
    expect(prompt).toMatch(/do not invent, redraw or complete/i);
  });

  // S3DiskUtil.upload sets no ContentType, so the bucket serves originals as
  // application/octet-stream — which Gemini rejects with "Unsupported MIME
  // type". Observed live before this was fixed.
  it('derives the original mime type from the key when S3 serves octet-stream', async () => {
    fetchMock.mockResolvedValue(
      okDownload('original-bytes', 'application/octet-stream'),
    );
    generateContentMock.mockResolvedValue(imageResponse('generated-bytes'));

    await service.generate(input);

    const parts = generateContentMock.mock.calls[0][0].contents[0].parts;
    expect(parts[1].inlineData.mimeType).toBe('image/jpeg');
  });

  it('maps a png temp key to image/png when the header is unusable', async () => {
    fetchMock.mockResolvedValue(okDownload('original-bytes', ''));
    generateContentMock.mockResolvedValue(imageResponse('generated-bytes'));

    await service.generate({ ...input, tempImageKey: 'tmp/7/original.PNG' });

    const parts = generateContentMock.mock.calls[0][0].contents[0].parts;
    expect(parts[1].inlineData.mimeType).toBe('image/png');
  });

  it('strips charset parameters from a usable image content-type', async () => {
    fetchMock.mockResolvedValue(
      okDownload('original-bytes', 'image/webp; charset=binary'),
    );
    generateContentMock.mockResolvedValue(imageResponse('generated-bytes'));

    await service.generate(input);

    const parts = generateContentMock.mock.calls[0][0].contents[0].parts;
    expect(parts[1].inlineData.mimeType).toBe('image/webp');
  });

  it('keeps the mime type of the generated image when naming the stored file', async () => {
    generateContentMock.mockResolvedValue(
      imageResponse('generated-bytes', 'image/webp'),
    );

    await service.generate(input);

    expect(mediaStorageService.store).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'product-image.webp' }),
      'user-images/7',
    );
  });

  it('reports a failed result without throwing when the model call rejects', async () => {
    generateContentMock.mockRejectedValue(new Error('model unavailable'));

    await expect(service.generate(input)).resolves.toEqual({
      status: ImageStatus.Failed,
      reason: 'model unavailable',
    });
    expect(mediaStorageService.store).not.toHaveBeenCalled();
  });

  it('reports a failed result when the model returns no image part', async () => {
    generateContentMock.mockResolvedValue({
      candidates: [{ content: { parts: [{ text: 'I cannot do that' }] } }],
    });

    const result = await service.generate(input);

    expect(result.status).toBe(ImageStatus.Failed);
    expect(mediaStorageService.store).not.toHaveBeenCalled();
  });

  it('reports a failed result when the temp original cannot be downloaded', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => null },
      arrayBuffer: async () => Buffer.alloc(0),
    });

    const result = await service.generate(input);

    expect(result.status).toBe(ImageStatus.Failed);
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('reports a failed result when no signed URL comes back for the temp key', async () => {
    mediaStorageService.getUrls.mockResolvedValue({});

    const result = await service.generate(input);

    expect(result.status).toBe(ImageStatus.Failed);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a failed result when the upload of the generated image rejects', async () => {
    generateContentMock.mockResolvedValue(imageResponse('generated-bytes'));
    mediaStorageService.store.mockRejectedValue(new Error('s3 unreachable'));

    await expect(service.generate(input)).resolves.toEqual({
      status: ImageStatus.Failed,
      reason: 's3 unreachable',
    });
  });
});
