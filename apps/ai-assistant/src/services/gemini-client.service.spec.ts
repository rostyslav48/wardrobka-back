import { Logger } from '@nestjs/common';

const generateContentMock = jest.fn();

// Only the client is faked — Type and FunctionCallingConfigMode stay real so
// the tool declarations and toolConfig are asserted against the SDK's own enums.
jest.mock('@google/genai', () => ({
  ...jest.requireActual('@google/genai'),
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
}));

import { GeminiClientService } from './gemini-client.service';

describe('GeminiClientService', () => {
  const configValues: Record<string, unknown> = {
    GEMINI_MODEL: 'gemini-2.5-flash',
    AI_MAX_TOOL_ROUNDS: 4,
    AI_MAX_TOOL_CALLS: 8,
  };
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('test-api-key'),
    get: jest.fn((key: string, fallback?: unknown) =>
      key in configValues ? configValues[key] : fallback,
    ),
  };

  let service: GeminiClientService;
  let executeTool: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    configService.getOrThrow.mockReturnValue('test-api-key');
    configValues.AI_MAX_TOOL_ROUNDS = 4;
    configValues.AI_MAX_TOOL_CALLS = 8;
    executeTool = jest.fn().mockResolvedValue({ items: [], total: 0 });
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
      referenceImages: [],
      seedSummary: 'Wardrobe summary (orientation only)',
      executeTool,
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

  it('scopes the no-invented-items rule to recommendations and explicitly allows recalling earlier conversation facts', async () => {
    await service.generateChatResponse({
      prompt: 'what colour is it',
      history: [
        { role: 'user', text: 'my favourite jacket is emerald green' },
        { role: 'model', text: 'Got it.' },
      ],
      referenceImages: [],
      seedSummary: 'Wardrobe summary (orientation only)',
      executeTool,
    });

    const call = generateContentMock.mock.calls[0][0];
    expect(call.config.systemInstruction).toEqual(
      expect.stringContaining('When recommending items to wear'),
    );
    expect(call.config.systemInstruction).toEqual(
      expect.stringContaining(
        'discuss and refer back to anything the user has told you earlier',
      ),
    );
  });

  it('replays history as contents with user/model roles, ending with the current turn', async () => {
    await service.generateChatResponse({
      prompt: 'and in blue?',
      history: [
        { role: 'user', text: 'suggest a jacket' },
        { role: 'model', text: 'wear the red one' },
      ],
      referenceImages: [],
      seedSummary: 'Wardrobe summary (orientation only)',
      executeTool,
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
      referenceImages: [{ mimeType: 'image/jpeg', data: 'ZmFrZS1ieXRlcw==' }],
      seedSummary: 'Wardrobe summary (orientation only)',
      executeTool,
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
      referenceImages: [],
      seedSummary: 'Wardrobe summary (orientation only)',
      executeTool,
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
      referenceImages: [],
      seedSummary: 'Wardrobe summary (orientation only)',
      executeTool,
    });

    expect(result).toBe('I need more details to help with that request.');
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('registers the four retrieval tools and declares no accountId parameter', async () => {
    await service.generateChatResponse({
      prompt: 'hello',
      history: [],
      referenceImages: [],
      seedSummary: 'Wardrobe summary (orientation only)',
      executeTool,
    });

    const call = generateContentMock.mock.calls[0][0];
    const declarations = call.config.tools[0].functionDeclarations;

    expect(declarations.map((d: { name: string }) => d.name)).toEqual([
      'search_wardrobe',
      'get_item_details',
      'get_weather',
      'get_recent_outfits',
    ]);
    expect(JSON.stringify(declarations)).not.toContain('accountId');
  });

  it('completes with zero tool calls when the model answers in text', async () => {
    const result = await service.generateChatResponse({
      prompt: 'how do I get a wine stain out of cotton',
      history: [],
      referenceImages: [],
      seedSummary: 'Wardrobe summary (orientation only)',
      executeTool,
    });

    expect(result).toBe('the assistant reply');
    expect(executeTool).not.toHaveBeenCalled();
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it('executes returned function calls, appends the responses and resends', async () => {
    generateContentMock
      .mockResolvedValueOnce({
        functionCalls: [
          { name: 'search_wardrobe', args: { type: 'jacket' }, id: 'c1' },
        ],
        usageMetadata: {},
      })
      .mockResolvedValueOnce({
        text: 'wear the navy jacket',
        usageMetadata: {},
      });
    executeTool.mockResolvedValue({ items: [{ id: 7 }], total: 1 });

    const result = await service.generateChatResponse({
      prompt: 'what jacket should I wear',
      history: [],
      referenceImages: [],
      seedSummary: 'Wardrobe summary (orientation only)',
      executeTool,
    });

    expect(result).toBe('wear the navy jacket');
    expect(executeTool).toHaveBeenCalledWith('search_wardrobe', {
      type: 'jacket',
    });

    const secondCall = generateContentMock.mock.calls[1][0];
    const [modelTurn, toolTurn] = secondCall.contents.slice(-2);
    expect(modelTurn.role).toBe('model');
    expect(modelTurn.parts[0].functionCall.name).toBe('search_wardrobe');
    expect(toolTurn.parts[0].functionResponse).toEqual({
      id: 'c1',
      name: 'search_wardrobe',
      response: { items: [{ id: 7 }], total: 1 },
    });
  });

  it('logs every tool call with its name and arguments', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    generateContentMock
      .mockResolvedValueOnce({
        functionCalls: [
          { name: 'search_wardrobe', args: { type: 'coat', season: 'winter' } },
        ],
        usageMetadata: {},
      })
      .mockResolvedValueOnce({ text: 'done', usageMetadata: {} });

    await service.generateChatResponse({
      prompt: 'coat please',
      history: [],
      referenceImages: [],
      seedSummary: 'Wardrobe summary (orientation only)',
      executeTool,
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'search_wardrobe({"type":"coat","season":"winter"})',
      ),
    );

    logSpy.mockRestore();
  });

  it('serves an identical tool + args pair from cache but still charges the budget', async () => {
    const duplicate = {
      functionCalls: [{ name: 'get_weather', args: { days: 2 } }],
      usageMetadata: {},
    };
    generateContentMock.mockResolvedValue(duplicate);
    configValues.AI_MAX_TOOL_ROUNDS = 10;
    configValues.AI_MAX_TOOL_CALLS = 3;
    service = new GeminiClientService(configService as never);

    await service.generateChatResponse({
      prompt: 'is it cold',
      history: [],
      referenceImages: [],
      seedSummary: 'Wardrobe summary (orientation only)',
      executeTool,
    });

    // Three identical calls: only the first reaches the executor, but all three
    // are charged, so the call budget still ends the loop before the round cap.
    expect(executeTool).toHaveBeenCalledTimes(1);
    const lastToolTurn = generateContentMock.mock.calls
      .at(-1)[0]
      .contents.filter(
        (c: { parts: { functionResponse?: unknown }[] }) =>
          c.parts[0]?.functionResponse,
      );
    expect(lastToolTurn.length).toBe(4);
  });

  it('treats argument key order as the same cache entry', async () => {
    generateContentMock
      .mockResolvedValueOnce({
        functionCalls: [
          { name: 'search_wardrobe', args: { type: 'shirt', color: 'Navy' } },
          { name: 'search_wardrobe', args: { color: 'Navy', type: 'shirt' } },
        ],
        usageMetadata: {},
      })
      .mockResolvedValueOnce({ text: 'done', usageMetadata: {} });

    await service.generateChatResponse({
      prompt: 'navy shirts',
      history: [],
      referenceImages: [],
      seedSummary: 'Wardrobe summary (orientation only)',
      executeTool,
    });

    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it('stops at AI_MAX_TOOL_ROUNDS and answers with tools disabled instead of throwing', async () => {
    configValues.AI_MAX_TOOL_ROUNDS = 2;
    configValues.AI_MAX_TOOL_CALLS = 99;
    service = new GeminiClientService(configService as never);

    generateContentMock.mockImplementation(({ config }) =>
      config.toolConfig.functionCallingConfig.mode === 'NONE'
        ? Promise.resolve({ text: 'best I can do', usageMetadata: {} })
        : Promise.resolve({
            functionCalls: [
              { name: 'search_wardrobe', args: { type: `t${Math.random()}` } },
            ],
            usageMetadata: {},
          }),
    );

    const result = await service.generateChatResponse({
      prompt: 'keep searching',
      history: [],
      referenceImages: [],
      seedSummary: 'Wardrobe summary (orientation only)',
      executeTool,
    });

    expect(result).toBe('best I can do');
    // two tool-enabled rounds, then exactly one tools-disabled call
    expect(generateContentMock).toHaveBeenCalledTimes(3);
    expect(
      generateContentMock.mock.calls.at(-1)[0].config.toolConfig
        .functionCallingConfig.mode,
    ).toBe('NONE');
  });

  it('stops at AI_MAX_TOOL_CALLS and answers with tools disabled instead of throwing', async () => {
    configValues.AI_MAX_TOOL_ROUNDS = 99;
    configValues.AI_MAX_TOOL_CALLS = 2;
    service = new GeminiClientService(configService as never);

    generateContentMock.mockImplementation(({ config }) =>
      config.toolConfig.functionCallingConfig.mode === 'NONE'
        ? Promise.resolve({
            text: 'answering from what I have',
            usageMetadata: {},
          })
        : Promise.resolve({
            functionCalls: [
              { name: 'search_wardrobe', args: { type: 'a' } },
              { name: 'search_wardrobe', args: { type: 'b' } },
              { name: 'search_wardrobe', args: { type: 'c' } },
            ],
            usageMetadata: {},
          }),
    );

    const result = await service.generateChatResponse({
      prompt: 'search everything',
      history: [],
      referenceImages: [],
      seedSummary: 'Wardrobe summary (orientation only)',
      executeTool,
    });

    expect(result).toBe('answering from what I have');
    expect(executeTool).toHaveBeenCalledTimes(2);

    // Every requested call still gets a functionResponse — the over-budget one
    // carries an error rather than being dropped, so the turn stays well-formed.
    const finalContents = generateContentMock.mock.calls.at(-1)[0].contents;
    const toolTurn = finalContents.find(
      (c: {
        parts: { functionResponse?: { response: { error?: string } } }[];
      }) => c.parts[0]?.functionResponse,
    );
    expect(toolTurn.parts).toHaveLength(3);
    expect(toolTurn.parts[2].functionResponse.response.error).toContain(
      'tool budget',
    );
  });

  it('includes the seed summary in the current user turn', async () => {
    await service.generateChatResponse({
      prompt: 'what should I wear',
      history: [],
      referenceImages: [],
      seedSummary: 'Wardrobe summary (orientation only)',
      executeTool,
    });

    const call = generateContentMock.mock.calls[0][0];
    const currentTurn = call.contents.at(-1);
    expect(currentTurn.parts[0].text).toContain(
      'Wardrobe summary (orientation only)',
    );
    expect(currentTurn.parts[0].text).toContain('what should I wear');
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
