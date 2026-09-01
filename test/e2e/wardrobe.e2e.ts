import { test, expect } from '@playwright/test';
import {
  takeUser,
  auth,
  postJson,
  patchJson,
  throttleGap,
  TestUser,
} from './support/api';

let owner: TestUser;
let stranger: TestUser;
let itemId: number;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  owner = takeUser();
  stranger = takeUser();

  const res = await postJson(request, '/wardrobe', owner, {
    type: 'hoodie',
    color: '#FF0000',
    name: 'Seed Hoodie',
    season: 'winter',
  });
  expect(res.status(), await res.text()).toBe(201);
  itemId = (await res.json()).id;
});

test.describe('GET /wardrobe', () => {
  test('requires authentication', async ({ request }) => {
    expect((await request.get('/wardrobe')).status()).toBe(401);
  });

  test('returns only the caller’s items', async ({ request }) => {
    const mine = await (
      await request.get('/wardrobe', { headers: auth(owner) })
    ).json();
    expect(Array.isArray(mine)).toBe(true);
    expect(mine.map((i: any) => i.id)).toContain(itemId);

    const theirs = await (
      await request.get('/wardrobe', { headers: auth(stranger) })
    ).json();
    expect(theirs.map((i: any) => i.id)).not.toContain(itemId);
  });

  test('filters by an enum field', async ({ request }) => {
    const res = await request.get('/wardrobe?season=winter', {
      headers: auth(owner),
    });
    expect(res.status()).toBe(200);
    for (const item of await res.json()) expect(item.season).toBe('winter');
  });

  test('a filter that matches nothing returns an empty list', async ({
    request,
  }) => {
    const res = await request.get('/wardrobe?season=summer&type=dress', {
      headers: auth(owner),
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test('rejects an invalid enum value with 400', async ({ request }) => {
    const res = await request.get('/wardrobe?season=monsoon', {
      headers: auth(owner),
    });
    expect(res.status()).toBe(400);
  });

  test('rejects an unknown query parameter with 400', async ({ request }) => {
    const res = await request.get('/wardrobe?bogusParam=1', {
      headers: auth(owner),
    });
    expect(res.status()).toBe(400);
  });

  test('the favourite filter accepts a boolean-ish query string', async ({
    request,
  }) => {
    const res = await request.get('/wardrobe?favourite=true', {
      headers: auth(owner),
    });
    expect(res.status(), await res.text()).toBe(200);
  });

  test('favourite=false must not be silently treated as favourite=true', async ({
    request,
  }) => {
    const res = await request.get('/wardrobe?favourite=false', {
      headers: auth(owner),
    });
    expect(res.status(), await res.text()).toBe(200);
    for (const item of await res.json()) expect(item.favourite).toBe(false);
  });
});

test.describe('GET /wardrobe/:id', () => {
  test('returns the item to its owner', async ({ request }) => {
    const res = await request.get(`/wardrobe/${itemId}`, {
      headers: auth(owner),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(itemId);
    expect(body.name).toBe('Seed Hoodie');
  });

  test('does not expose another user’s item (IDOR)', async ({ request }) => {
    const res = await request.get(`/wardrobe/${itemId}`, {
      headers: auth(stranger),
    });
    expect([403, 404]).toContain(res.status());
  });

  test('returns 404 for an id that does not exist', async ({ request }) => {
    const res = await request.get('/wardrobe/99999999', {
      headers: auth(owner),
    });
    expect(res.status()).toBe(404);
  });

  test('handles a non-numeric id without a 500', async ({ request }) => {
    const res = await request.get('/wardrobe/not-a-number', {
      headers: auth(owner),
    });
    expect(
      res.status(),
      'a bad path param should be a 4xx, never a 500',
    ).toBeLessThan(500);
  });
});

test.describe('POST /wardrobe', () => {
  test('rejects a missing required field', async ({ request }) => {
    const res = await postJson(request, '/wardrobe', owner, {
      type: 'hoodie',
      color: '#00FF00',
    });
    expect(res.status()).toBe(400);
  });

  test('rejects a non-hex colour', async ({ request }) => {
    const res = await postJson(request, '/wardrobe', owner, {
      type: 'hoodie',
      color: 'red',
      name: 'Bad colour',
      season: 'winter',
    });
    expect(res.status()).toBe(400);
  });

  test('rejects an unknown enum value', async ({ request }) => {
    const res = await postJson(request, '/wardrobe', owner, {
      type: 'spacesuit',
      color: '#00FF00',
      name: 'Nope',
      season: 'winter',
    });
    expect(res.status()).toBe(400);
  });

  test('rejects an unknown property', async ({ request }) => {
    const res = await postJson(request, '/wardrobe', owner, {
      type: 'hoodie',
      color: '#00FF00',
      name: 'Extra',
      season: 'winter',
      accountId: 1,
    });
    expect(res.status()).toBe(400);
  });

  test('accepts every documented size value', async ({ request }) => {
    // Size enum values are s, m, l, xl, xxl — see BUG-004 (was mixed-case
    // xL/xxL, which rejected the natural lowercase spelling).
    for (const size of ['s', 'm', 'l', 'xl', 'xxl']) {
      const res = await postJson(request, '/wardrobe', owner, {
        type: 'shirt',
        color: '#0000FF',
        name: `Size ${size}`,
        season: 'summer',
        size,
      });
      expect(
        res.status(),
        `size "${size}" was rejected: ${await res.text()}`,
      ).toBe(201);
    }
  });
});

test.describe('PATCH /wardrobe/:id', () => {
  test('updates a field', async ({ request }) => {
    const res = await patchJson(request, `/wardrobe/${itemId}`, owner, {
      name: 'Renamed Hoodie',
      favourite: true,
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Renamed Hoodie');
  });

  test('cannot update another user’s item', async ({ request }) => {
    const res = await patchJson(request, `/wardrobe/${itemId}`, stranger, {
      name: 'Hijacked',
    });
    expect([403, 404]).toContain(res.status());

    const still = await (
      await request.get(`/wardrobe/${itemId}`, { headers: auth(owner) })
    ).json();
    expect(still.name).not.toBe('Hijacked');
  });

  test('rejects an invalid value', async ({ request }) => {
    const res = await patchJson(request, `/wardrobe/${itemId}`, owner, {
      color: 'not-a-colour',
    });
    expect(res.status()).toBe(400);
  });

  test('an empty patch body is a no-op, not a 500', async ({ request }) => {
    const res = await patchJson(request, `/wardrobe/${itemId}`, owner, {});
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('DELETE /wardrobe/:id', () => {
  test('cannot delete another user’s item', async ({ request }) => {
    const res = await request.delete(`/wardrobe/${itemId}`, {
      headers: auth(stranger),
    });
    expect([403, 404]).toContain(res.status());
    expect(
      (
        await request.get(`/wardrobe/${itemId}`, { headers: auth(owner) })
      ).status(),
    ).toBe(200);
  });

  test('deletes the caller’s own item', async ({ request }) => {
    const res = await request.delete(`/wardrobe/${itemId}`, {
      headers: auth(owner),
    });
    expect(res.status()).toBe(200);
    expect(
      (
        await request.get(`/wardrobe/${itemId}`, { headers: auth(owner) })
      ).status(),
    ).toBe(404);
  });

  test('deleting an already-deleted item returns 404', async ({ request }) => {
    const res = await request.delete(`/wardrobe/${itemId}`, {
      headers: auth(owner),
    });
    expect(res.status()).toBe(404);
  });
});

/**
 * Retry is a second, cheaper-looking door onto the same paid image generation,
 * so it has to answer to the same ownership and rate-limit rules as create.
 * The success path (an item that still has its original under tmp/) needs a
 * real photo and a real model call and is driven against the live stack, not
 * from here.
 */
test.describe('POST /wardrobe/:id/generate-image', () => {
  let retryItemId: number;

  test.beforeAll(async ({ request }) => {
    const res = await postJson(request, '/wardrobe', owner, {
      type: 'shirt',
      color: '#00FF00',
      name: 'Retry Seed',
      season: 'summer',
    });
    expect(res.status(), await res.text()).toBe(201);
    retryItemId = (await res.json()).id;
  });

  test('requires authentication', async ({ request }) => {
    const res = await request.post(`/wardrobe/${retryItemId}/generate-image`);
    expect(res.status()).toBe(401);
  });

  test('cannot retry another user’s item', async ({ request }) => {
    await throttleGap(5_100);
    const res = await request.post(`/wardrobe/${retryItemId}/generate-image`, {
      headers: auth(stranger),
    });
    expect([403, 404]).toContain(res.status());
  });

  test('an item with no retained original says so instead of failing silently', async ({
    request,
  }) => {
    await throttleGap(5_100);
    const res = await request.post(`/wardrobe/${retryItemId}/generate-image`, {
      headers: auth(owner),
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('IMAGE_ORIGINAL_EXPIRED');
    expect(body.message).toMatch(/no longer available/i);
  });

  test('is rate limited like the initial generation', async ({ request }) => {
    await throttleGap(5_100);
    await request.post(`/wardrobe/${retryItemId}/generate-image`, {
      headers: auth(owner),
    });
    const second = await request.post(
      `/wardrobe/${retryItemId}/generate-image`,
      {
        headers: auth(owner),
      },
    );
    expect(second.status()).toBe(429);
  });

  test('shares its rate limit bucket with POST /wardrobe, so alternating endpoints cannot double the rate', async ({
    request,
  }) => {
    await throttleGap(5_100);
    const created = await postJson(request, '/wardrobe', owner, {
      type: 'shirt',
      color: '#0000FF',
      name: 'Bucket Share Seed',
      season: 'summer',
    });
    expect(created.status(), await created.text()).toBe(201);
    const newItemId = (await created.json()).id;

    const res = await request.post(`/wardrobe/${newItemId}/generate-image`, {
      headers: auth(owner),
    });
    expect(res.status()).toBe(429);
  });
});
