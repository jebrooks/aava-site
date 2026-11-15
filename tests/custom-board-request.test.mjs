import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

test('custom-board submissions verify visitors before creating Shopify drafts', async (t) => {
  const state = {
    result: { isHuman: true, isBot: false },
    error: null,
    checks: [],
    drafts: [],
  };
  const fixtureKey = '__customBoardBotIdTest';
  globalThis[fixtureKey] = state;
  const server = await createServer({
    configFile: false,
    ssr: { noExternal: ['botid'] },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, ws: false },
    plugins: [{
      name: 'custom-board-service-fixtures',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'botid/server') return '\0test-botid';
        if (id === '../../lib/shopify/draft-orders') return '\0test-drafts';
      },
      load(id) {
        if (id === '\0test-botid') return `
          export async function checkBotId(options) {
            const state = globalThis.${fixtureKey};
            state.checks.push(options);
            if (state.error) throw state.error;
            return state.result;
          }
        `;
        if (id === '\0test-drafts') return `
          export async function createCustomBoardDraft(submission) {
            globalThis.${fixtureKey}.drafts.push(submission);
            return { name: '#TEST' };
          }
        `;
      },
    }],
  });
  t.after(async () => {
    await server.close();
    delete globalThis[fixtureKey];
  });
  const { POST } = await server.ssrLoadModule('/src/pages/api/custom-board-request.ts');
  let requestNumber = 0;
  const submit = (overrides = {}, origin = 'https://example.com', ip = `192.0.2.${++requestNumber}`) => POST({
    request: new Request('https://example.com/api/custom-board-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin,
        'x-forwarded-for': ip,
      },
      body: JSON.stringify({
        name: 'Test Visitor', email: 'visitor@example.com', phone: '555-0100',
        requestedDate: '2099-12-01', address: 'Test address', zip: '22201',
        guestCount: 10, ...overrides,
      }),
    }),
  });

  await t.test('human submission creates a draft with Basic verification', async () => {
    const response = await submit();
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ok: true, reference: '#TEST' });
    assert.equal(state.drafts.length, 1);
    assert.equal(state.checks[0].advancedOptions.checkLevel, 'basic');
    assert.equal(state.checks[0].advancedOptions.headers.origin, 'https://example.com');
  });

  await t.test('bots and visitors not classified as human cannot create drafts', async () => {
    for (const result of [{ isBot: true, isHuman: false }, { isBot: false, isHuman: false }]) {
      state.result = result;
      const response = await submit();
      assert.equal(response.status, 403);
      assert.match((await response.json()).error, /refresh the page/);
    }
    assert.equal(state.drafts.length, 1);
  });

  await t.test('verification outage returns a retryable error without creating a draft', async () => {
    state.error = new Error('Verification unavailable');
    const response = await submit();
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /try again shortly/);
    assert.equal(state.drafts.length, 1);
    state.error = null;
    state.result = { isBot: false, isHuman: true };
  });

  await t.test('spam trap and cross-origin checks still stop submissions', async () => {
    const checksBefore = state.checks.length;
    assert.equal((await submit({ company: 'spam' })).status, 200);
    assert.equal((await submit({}, 'https://other.example')).status, 403);
    assert.equal(state.checks.length, checksBefore);
    assert.equal(state.drafts.length, 1);
  });

  await t.test('human submissions still require valid form fields', async () => {
    assert.equal((await submit({ email: 'invalid' })).status, 400);
    assert.equal(state.drafts.length, 1);
  });

  await t.test('repeated requests from the same IP are rate limited before verification', async () => {
    const checksBefore = state.checks.length;
    for (let attempt = 0; attempt < 5; attempt++) {
      assert.equal((await submit({ email: 'invalid' }, undefined, '192.0.2.200')).status, 400);
    }
    assert.equal((await submit({}, undefined, '192.0.2.200')).status, 429);
    assert.equal(state.checks.length, checksBefore + 5);
    assert.equal(state.drafts.length, 1);
  });
});
