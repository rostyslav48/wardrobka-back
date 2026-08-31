import { firstValueFrom } from 'rxjs';

import { HttpService } from './http.service';

describe('HttpService', () => {
  let service: HttpService;
  let fetchMock: jest.Mock;

  const okResponse = () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true }),
  });

  const lastInit = (): RequestInit => fetchMock.mock.calls[0][1] as RequestInit;
  const lastHeaders = (): Record<string, string> =>
    lastInit().headers as Record<string, string>;

  beforeEach(() => {
    service = new HttpService();
    fetchMock = jest.fn().mockResolvedValue(okResponse());
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('form-encodes a URLSearchParams body instead of JSON-stringifying it', async () => {
    await firstValueFrom(
      service.post(
        'https://oauth2.googleapis.com/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: 'r-1',
        }),
      ),
    );

    expect(lastHeaders()['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(lastInit().body).toBe('grant_type=refresh_token&refresh_token=r-1');
    // JSON.stringify(new URLSearchParams(...)) is "{}" — the bug this guards.
    expect(lastInit().body).not.toBe('{}');
  });

  it('still JSON-encodes an object body', async () => {
    await firstValueFrom(
      service.post('https://example.com/api', { name: 'shirt', count: 2 }),
    );

    expect(lastHeaders()['Content-Type']).toBe('application/json');
    expect(lastInit().body).toBe('{"name":"shirt","count":2}');
  });

  it('sends no body and no Content-Type on a GET', async () => {
    await firstValueFrom(service.get('https://example.com/api'));

    expect(lastInit().body).toBeUndefined();
    expect(lastHeaders()['Content-Type']).toBeUndefined();
  });
});
