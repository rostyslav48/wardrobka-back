import { test, expect } from '@playwright/test';
import { takeUser, auth, postJson, throttleGap, TestUser } from './support/api';

let owner: TestUser;
let stranger: TestUser;
let ownItemId: number;
let strangerItemId: number;
let logId: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  owner = takeUser();
  stranger = takeUser();

  const mine = await postJson(request, '/wardrobe', owner, {
    type: 'jeans',
    color: '#101010',
    name: 'Log Jeans',
    season: 'autumn',
  });
  expect(mine.status(), await mine.text()).toBe(201);
  ownItemId = (await mine.json()).id;

  const theirs = await postJson(request, '/wardrobe', stranger, {
    type: 'coat',
    color: '#202020',
    name: 'Their Coat',
    season: 'winter',
  });
  expect(theirs.status(), await theirs.text()).toBe(201);
  strangerItemId = (await theirs.json()).id;
});

test.describe('POST /outfit-log', () => {
  test('requires authentication', async ({ request }) => {
    const res = await request.post('/outfit-log', {
      data: { date: Date.now() - 1000, wardrobeItemIds: [] },
    });
    expect(res.status()).toBe(401);
  });

  test('creates a log entry', async ({ request }) => {
    const res = await request.post('/outfit-log', {
      headers: auth(owner),
      data: {
        date: Date.now() - 60_000,
        wardrobeItemIds: [ownItemId],
        notes: 'e2e entry',
      },
    });
    expect(res.status(), await res.text()).toBe(201);
    const body = await res.json();
    logId = body.id;
    expect(body.wardrobeItemIds).toEqual([ownItemId]);
    expect(body.notes).toBe('e2e entry');
  });

  test('rejects a future date', async ({ request }) => {
    const res = await request.post('/outfit-log', {
      headers: auth(owner),
      data: { date: Date.now() + 86_400_000, wardrobeItemIds: [] },
    });
    expect(res.status()).toBe(400);
  });

  test('rejects a non-numeric date', async ({ request }) => {
    const res = await request.post('/outfit-log', {
      headers: auth(owner),
      data: { date: 'yesterday', wardrobeItemIds: [] },
    });
    expect(res.status()).toBe(400);
  });

  test('rejects non-integer wardrobe item ids', async ({ request }) => {
    const res = await request.post('/outfit-log', {
      headers: auth(owner),
      data: { date: Date.now() - 1000, wardrobeItemIds: ['abc'] },
    });
    expect(res.status()).toBe(400);
  });

  test('rejects an unknown property', async ({ request }) => {
    const res = await request.post('/outfit-log', {
      headers: auth(owner),
      data: { date: Date.now() - 1000, wardrobeItemIds: [], accountId: 1 },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('GET /outfit-log', () => {
  test('lists the caller’s own entries', async ({ request }) => {
    const res = await request.get('/outfit-log', { headers: auth(owner) });
    expect(res.status()).toBe(200);
    const list = await res.json();
    expect(list.map((l: any) => l.id)).toContain(logId);
  });

  test('does not list another user’s entries', async ({ request }) => {
    const list = await (
      await request.get('/outfit-log', { headers: auth(stranger) })
    ).json();
    expect(list.map((l: any) => l.id)).not.toContain(logId);
  });

  test('GET /outfit-log/:id returns the entry to its owner', async ({ request }) => {
    const res = await request.get(`/outfit-log/${logId}`, { headers: auth(owner) });
    expect(res.status()).toBe(200);
    expect((await res.json()).id).toBe(logId);
  });

  test('GET /outfit-log/:id is not readable by another user', async ({ request }) => {
    const res = await request.get(`/outfit-log/${logId}`, { headers: auth(stranger) });
    expect([403, 404]).toContain(res.status());
  });

  test('GET /outfit-log/:id for an unknown uuid returns 404', async ({ request }) => {
    const res = await request.get('/outfit-log/00000000-0000-4000-8000-000000000000', {
      headers: auth(owner),
    });
    expect(res.status()).toBe(404);
  });
});

test.describe('PATCH /outfit-log/:id', () => {
  test('updates notes', async ({ request }) => {
    const res = await request.patch(`/outfit-log/${logId}`, {
      headers: auth(owner),
      data: { notes: 'updated note' },
    });
    expect(res.status(), await res.text()).toBe(200);
    expect((await res.json()).notes).toBe('updated note');
  });

  test('replaces the item list', async ({ request }) => {
    const res = await request.patch(`/outfit-log/${logId}`, {
      headers: auth(owner),
      data: { wardrobeItemIds: [] },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).wardrobeItemIds).toEqual([]);

    const restore = await request.patch(`/outfit-log/${logId}`, {
      headers: auth(owner),
      data: { wardrobeItemIds: [ownItemId] },
    });
    expect((await restore.json()).wardrobeItemIds).toEqual([ownItemId]);
  });

  test('rejects a future date', async ({ request }) => {
    const res = await request.patch(`/outfit-log/${logId}`, {
      headers: auth(owner),
      data: { date: Date.now() + 86_400_000 },
    });
    expect(res.status()).toBe(400);
  });

  test('cannot be updated by another user', async ({ request }) => {
    const res = await request.patch(`/outfit-log/${logId}`, {
      headers: auth(stranger),
      data: { notes: 'hijack' },
    });
    expect([403, 404]).toContain(res.status());
  });
});

test.describe('outfit-log ↔ wardrobe ownership', () => {
  test('deleting a wardrobe item does not corrupt its outfit logs', async ({
    request,
  }) => {
    const created = await postJson(request, '/wardrobe', owner, {
      type: 'vest',
      color: '#303030',
      name: 'Doomed Vest',
      season: 'spring',
    });
    expect(created.status(), await created.text()).toBe(201);
    const doomedId = (await created.json()).id;

    const log = await request.post('/outfit-log', {
      headers: auth(owner),
      data: { date: Date.now() - 1000, wardrobeItemIds: [doomedId], notes: 'cascade' },
    });
    expect(log.status(), await log.text()).toBe(201);
    const cascadeLogId = (await log.json()).id;

    const del = await request.delete(`/wardrobe/${doomedId}`, { headers: auth(owner) });
    expect(
      del.status(),
      'deleting an item referenced by an outfit log must not fail on an FK',
    ).toBe(200);

    const after = await request.get(`/outfit-log/${cascadeLogId}`, {
      headers: auth(owner),
    });
    expect(after.status(), 'the log entry must still be readable').toBe(200);
    // The entry keeps a dangling reference to the deleted item — BUG-011.
  });
});

test.describe('DELETE /outfit-log/:id', () => {
  test('cannot be deleted by another user', async ({ request }) => {
    const res = await request.delete(`/outfit-log/${logId}`, { headers: auth(stranger) });
    expect([403, 404]).toContain(res.status());
  });

  test('removes the caller’s own entry from the database', async ({ request }) => {
    // The response status is BUG-012 (always 500) — pinned in known-bugs.e2e.ts.
    await request.delete(`/outfit-log/${logId}`, { headers: auth(owner) });
    expect(
      (await request.get(`/outfit-log/${logId}`, { headers: auth(owner) })).status(),
    ).toBe(404);
  });
});
