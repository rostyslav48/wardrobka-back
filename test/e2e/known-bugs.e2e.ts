/**
 * Executable reproductions of the defects listed in
 * `planning/qa/BUGS-2026-08-29.md`.
 *
 * All defects below (BUG-001..012) are fixed; these run as normal tests now.
 */
import { test, expect } from '@playwright/test';
import { takeUser, auth, login, postJson, throttleGap, TestUser } from './support/api';

let owner: TestUser;
let stranger: TestUser;

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  owner = takeUser();
  stranger = takeUser();
});

test('BUG-001 login leaks whether an email is registered (404 vs 401)', async ({
  request,
}) => {
  const unknown = await login(request, {
    email: `nobody-${Date.now()}@example.com`,
    password: 'Password123!',
  });
  const wrongPassword = await login(request, {
    email: owner.email,
    password: 'DefinitelyWrong123!',
  });

  expect(
    unknown.status(),
    'an unknown account and a wrong password must be indistinguishable',
  ).toBe(wrongPassword.status());
});

test('BUG-002 malformed uuid path params return 500 instead of 400', async ({
  request,
}) => {
  const res = await request.get('/outfit-log/not-a-uuid', { headers: auth(owner) });
  expect(res.status(), await res.text()).toBe(400);
});

test('BUG-002b malformed assistant session id returns 500 instead of 400', async ({
  request,
}) => {
  const res = await request.get('/ai-assistant/sessions/not-a-uuid/messages', {
    headers: auth(owner),
  });
  expect(res.status(), await res.text()).toBe(400);
});

test('BUG-007 chat contextItemIds element type is unvalidated and reaches the DB', async ({
  request,
}) => {
  const res = await request.post('/ai-assistant/chat', {
    headers: auth(owner),
    data: { prompt: 'hi', contextItemIds: ['1); DROP TABLE wardrobe_item;--'] },
  });
  expect(
    res.status(),
    'contextItemIds feeds a database lookup and must be integer-validated',
  ).toBe(400);
});

test('BUG-003 the wardrobe write throttle is not the configured 1 write / 5s', async ({
  request,
}) => {
  await throttleGap(6_000);
  const statuses: number[] = [];
  for (let i = 0; i < 5; i++) {
    const res = await request.post('/wardrobe', {
      headers: auth(owner),
      data: {
        type: 'shirt',
        color: '#ABCDEF',
        name: `Throttle probe ${i}`,
        season: 'spring',
      },
    });
    statuses.push(res.status());
  }

  expect(
    statuses.filter((s) => s === 201).length,
    `observed: ${statuses.join(', ')}`,
  ).toBe(1);
});

test('BUG-004 the Size enum rejects the natural lowercase xl / xxl spelling', async ({
  request,
}) => {
  // the wardrobe write throttle (fixed by BUG-003, 1 write / 5s) is still
  // cooling down from the previous test's burst — wait out its window rather
  // than the default gap.
  await throttleGap(6_000);
  const res = await request.post('/wardrobe', {
    headers: auth(owner),
    data: {
      type: 'shirt',
      color: '#0000FF',
      name: 'Lowercase xl',
      season: 'summer',
      size: 'xl',
    },
  });
  expect(res.status(), await res.text()).toBe(201);
});

test('BUG-005 an outfit log may reference another user’s wardrobe item', async ({
  request,
}) => {
  const theirs = await postJson(request, '/wardrobe', stranger, {
    type: 'coat',
    color: '#202020',
    name: 'Not yours',
    season: 'winter',
  });
  expect(theirs.status(), await theirs.text()).toBe(201);
  const foreignId = (await theirs.json()).id;

  const res = await request.post('/outfit-log', {
    headers: auth(owner),
    data: { date: Date.now() - 1000, wardrobeItemIds: [foreignId] },
  });

  if (res.ok()) {
    expect((await res.json()).wardrobeItemIds).not.toContain(foreignId);
  } else {
    expect([400, 403, 404]).toContain(res.status());
  }
});

test('BUG-006 signup echoes the internal protectedData column back to the client', async ({
  request,
}) => {
  test.setTimeout(180_000);

  let body: any = null;
  for (let attempt = 0; attempt < 10 && !body; attempt++) {
    const res = await request.post('/auth/signup', {
      data: {
        name: 'ProtectedData Probe',
        email: `pd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
        password: 'Password123!',
      },
    });
    if (res.ok()) body = await res.json();
    else if (res.status() === 429) await new Promise((r) => setTimeout(r, 13_000));
    else throw new Error(`signup failed (${res.status()}): ${await res.text()}`);
  }

  expect(body, 'could not create a probe account').not.toBeNull();
  expect(
    body,
    'protectedData is an encrypted internal column and must not be serialised',
  ).not.toHaveProperty('protectedData');
});

test('BUG-008 the gateway sends no CORS headers, so the web build cannot call it', async ({
  request,
}) => {
  const res = await request.fetch('/auth/login', {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:8081',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,x-requested-with',
    },
  });

  const allowOrigin = res.headers()['access-control-allow-origin'];
  expect(
    allowOrigin,
    'main.ts never calls app.enableCors(); the browser blocks every API call from the Expo web build',
  ).toBeTruthy();
});

test('BUG-009 the wardrobe item detail DTO drops the favourite flag', async ({
  request,
}) => {
  const created = await postJson(request, '/wardrobe', owner, {
    type: 'polo',
    color: '#ABCABC',
    name: 'Favourite probe',
    season: 'summer',
    favourite: true,
  });
  expect(created.status(), await created.text()).toBe(201);
  const id = (await created.json()).id;

  const detail = await (
    await request.get(`/wardrobe/${id}`, { headers: auth(owner) })
  ).json();

  expect(
    detail,
    'WardrobeItemDto exposes "favorite" while the entity, the list DTO and the app all use "favourite"',
  ).toHaveProperty('favourite');
});

test('BUG-010 a JSON boolean for favourite is coerced to false', async ({ request }) => {
  const created = await postJson(request, '/wardrobe', owner, {
    type: 'polo',
    color: '#BCABCA',
    name: 'JSON favourite probe',
    season: 'summer',
    favourite: true,
  });
  expect(created.status(), await created.text()).toBe(201);
  const id = (await created.json()).id;

  const favourites = await (
    await request.get('/wardrobe?favourite=true', { headers: auth(owner) })
  ).json();

  expect(
    favourites.map((i: any) => i.id),
    '@Transform(value === "true") only works for multipart form data, not JSON',
  ).toContain(id);
});

test('BUG-011 deleting a wardrobe item leaves dangling outfit-log references', async ({
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
    data: { date: Date.now() - 1000, wardrobeItemIds: [doomedId] },
  });
  expect(log.status(), await log.text()).toBe(201);
  const logId = (await log.json()).id;

  expect((await request.delete(`/wardrobe/${doomedId}`, { headers: auth(owner) })).status()).toBe(
    200,
  );

  const after = await (
    await request.get(`/outfit-log/${logId}`, { headers: auth(owner) })
  ).json();

  expect(
    after.wardrobeItemIds,
    'outfit_log_item rows are not cleaned up when the wardrobe item is deleted',
  ).not.toContain(doomedId);
});

test('BUG-012 DELETE /outfit-log/:id returns 500 even though the row is removed', async ({
  request,
}) => {
  const log = await request.post('/outfit-log', {
    headers: auth(owner),
    data: { date: Date.now() - 1000, wardrobeItemIds: [], notes: 'delete probe' },
  });
  expect(log.status(), await log.text()).toBe(201);
  const id = (await log.json()).id;

  const res = await request.delete(`/outfit-log/${id}`, { headers: auth(owner) });
  expect(
    res.status(),
    'the RMQ handler returns void, so the gateway observable completes empty and rxjs throws EmptyError',
  ).toBe(200);
});
