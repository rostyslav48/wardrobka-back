import { Logger } from '@nestjs/common';

const generateContentMock = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
}));

import { GeminiClientService } from './gemini-client.service';

describe('GeminiClientService', () => {
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('test-api-key'),
    get: jest.fn().mockReturnValue('gemini-2.5-flash'),
  };

  let service: GeminiClientService;

  beforeEach(() => {
    jest.clearAllMocks();
    configService.getOrThrow.mockReturnValue('test-api-key');
    configService.get.mockReturnValue('gemini-2.5-flash');
    generateContentMock.mockResolvedValue({
      text: 'the assistant reply',
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4 },
    });
    service = new GeminiClientService(configService as never);
  });

  it('sends the assistant role and rules as systemInstruction, not in contents', async () => {
    await service.generateChatResponse({
      prompt: 'what should I wear',
      history: [],
      wardrobeItems: [],
      referenceImages: [],
    });

    const call = generateContentMock.mock.calls[0][0];
    expect(call.config.systemInstruction).toEqual(
      expect.stringContaining('AI wardrobe assistant'),
    );
    expect(
      call.contents.every(
        (content: { parts: { text?: string }[] }) =>
          !content.parts.some((part) =>
            part.text?.includes('AI wardrobe assistant'),
          ),
      ),
    ).toBe(true);
  });

  it('replays history as contents with user/model roles, ending with the current turn', async () => {
    await service.generateChatResponse({
      prompt: 'and in blue?',
      history: [
        { role: 'user', text: 'suggest a jacket' },
        { role: 'model', text: 'wear the red one' },
      ],
      wardrobeItems: [],
      referenceImages: [],
    });

    const call = generateContentMock.mock.calls[0][0];
    expect(call.contents).toHaveLength(3);
    expect(call.contents[0]).toEqual({
      role: 'user',
      parts: [{ text: 'suggest a jacket' }],
    });
    expect(call.contents[1]).toEqual({
      role: 'model',
      parts: [{ text: 'wear the red one' }],
    });
    expect(call.contents[2].role).toBe('user');
    expect(call.contents[2].parts[0].text).toContain('and in blue?');
  });

  it('attaches reference images as inlineData parts, never as text URLs', async () => {
    await service.generateChatResponse({
      prompt: 'what do you think of this',
      history: [],
      wardrobeItems: [],
      referenceImages: [{ mimeType: 'image/jpeg', data: 'ZmFrZS1ieXRlcw==' }],
    });

    const call = generateContentMock.mock.calls[0][0];
    const currentTurn = call.contents[call.contents.length - 1];

    expect(currentTurn.parts).toContainEqual({
      inlineData: { mimeType: 'image/jpeg', data: 'ZmFrZS1ieXRlcw==' },
    });
    expect(
      currentTurn.parts.every(
        (part: { text?: string }) =>
          !part.text?.includes('data:image') && !part.text?.includes('http'),
      ),
    ).toBe(true);
  });

  it('logs prompt tokens, response tokens and latency for every call', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    await service.generateChatResponse({
      prompt: 'hello',
      history: [],
      wardrobeItems: [],
      referenceImages: [],
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/promptTokens=12.*responseTokens=4.*latencyMs=\d+/),
    );

    logSpy.mockRestore();
  });

  it('returns a fallback message and warns when Gemini returns empty text', async () => {
    generateContentMock.mockResolvedValue({
      text: '',
      usageMetadata: {},
    });
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    const result = await service.generateChatResponse({
      prompt: 'hello',
      history: [],
      wardrobeItems: [],
      referenceImages: [],
    });

    expect(result).toBe('I need more details to help with that request.');
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('generateOutfitSummary also uses systemInstruction and logs usage', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    const result = await service.generateOutfitSummary({
      occasion: 'wedding',
      wardrobeItems: [],
    });

    const call = generateContentMock.mock.calls[0][0];
    expect(call.config.systemInstruction).toEqual(
      expect.stringContaining('AI wardrobe assistant'),
    );
    expect(result).toBe('the assistant reply');
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('generateOutfitSummary'),
    );

    logSpy.mockRestore();
  });
});
