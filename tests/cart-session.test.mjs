import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { CART_ID_KEY, CART_COUNT_KEY, CART_NOT_FOUND, loadStoredCart, isMissingCartResponse } from '../src/lib/cart-session.ts';

function storageWithCart() {
  const values = new Map([[CART_ID_KEY, 'gid://shopify/Cart/completed?key=private'], [CART_COUNT_KEY, '3']]);
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test('cart loading clears only a confirmed missing Shopify cart and preserves recoverable sessions', async t => {
  const state = { cart: null, errorStatus: null, reads: 0, mutations: 0 };
  globalThis.__cartSessionTest = state;
  const server = await createServer({
    configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, ws: false },
    plugins: [{
      name: 'cart-session-fixture', enforce: 'pre',
      resolveId(id) {
        if (id === '../../lib/shopify/storefront') return '\0session-storefront';
        if (id === '../../lib/shopify/schedule') return '\0session-schedule';
      },
      load(id) {
        if (id === '\0session-storefront') return `
          import {ShopifyApiError} from '/src/lib/shopify/client.ts';
          const state = globalThis.__cartSessionTest;
          export async function getCart() {
            state.reads++;
            if (state.errorStatus) throw new ShopifyApiError('Commerce service unavailable.', state.errorStatus);
            return state.cart;
          }
          const unexpected = () => { state.mutations++; throw new Error('Unexpected cart mutation'); };
          export const addCartLine = unexpected, assertCatalogVariant = unexpected, createCart = unexpected,
            removeCartLines = unexpected, removeUnusedDelivery = unexpected, copyCartWithLineChange = unexpected,
            copyCartWithAddedLine = unexpected, updateCartAttributes = unexpected, updateCartLine = unexpected,
            ensureCartServingCounts = unexpected, ensureCartDeliveryWindow = unexpected;
        `;
        if (id === '\0session-schedule') return `
          export const assertDeliverySlotAvailable = async () => ({key:'2026-12-02:13:00',date:'2026-12-02',label:'1–3 PM'});
        `;
      },
    }],
  });
  t.after(async () => { await server.close(); delete globalThis.__cartSessionTest; });
  const { GET, POST } = await server.ssrLoadModule('/src/pages/api/cart.ts');
  const fetchCart = async url => GET({ url: new URL(url, 'https://example.com') });
  const activeCart = {
    id: 'gid://shopify/Cart/completed?key=private', checkoutUrl: 'https://example.com/private-checkout',
    totalQuantity: 3, attributes: [{key:'Checkout locked',value:'true'}], lines: {nodes:[]},
    cost: {subtotalAmount:{amount:'59',currencyCode:'USD'},totalAmount:{amount:'59',currencyCode:'USD'}},
  };

  await t.test('completed or expired cart becomes empty and clears the stored badge count', async () => {
    const storage = storageWithCart();
    assert.equal(await loadStoredCart(storage, fetchCart), null);
    assert.equal(storage.getItem(CART_ID_KEY), null);
    assert.equal(storage.getItem(CART_COUNT_KEY), '0');
    assert.equal(state.reads, 1);
    assert.equal(state.mutations, 0);
  });

  await t.test('a count without a cart ID is reset without querying Shopify', async () => {
    const storage = storageWithCart();
    storage.removeItem(CART_ID_KEY);
    const reads = state.reads;
    assert.equal(await loadStoredCart(storage, fetchCart), null);
    assert.equal(storage.getItem(CART_COUNT_KEY), '0');
    assert.equal(state.reads, reads);
  });

  await t.test('an active saved cart is retained and its private checkout URL is not exposed', async () => {
    state.cart = activeCart;
    const storage = storageWithCart();
    const cart = await loadStoredCart(storage, fetchCart);
    assert.equal(cart.id, activeCart.id);
    assert.deepEqual(cart.attributes, activeCart.attributes);
    assert.equal(cart.checkoutUrl, '');
    assert.equal(storage.getItem(CART_ID_KEY), activeCart.id);
    assert.equal(storage.getItem(CART_COUNT_KEY), '3');
  });

  await t.test('upstream errors, including upstream 404, retain the session for retry', async () => {
    for (const status of [404, 503]) {
      const storage = storageWithCart();
      state.errorStatus = status;
      await assert.rejects(loadStoredCart(storage, fetchCart), /Commerce service unavailable/);
      assert.equal(storage.getItem(CART_ID_KEY), activeCart.id);
      assert.equal(storage.getItem(CART_COUNT_KEY), '3');
      state.errorStatus = null;
      assert.equal((await loadStoredCart(storage, fetchCart)).id, activeCart.id);
    }
  });

  await t.test('network failures and invalid response bodies cannot erase a saved cart', async () => {
    for (const fetcher of [
      async () => { throw new Error('Network unavailable'); },
      async () => new Response('Not JSON', {status:502}),
      async () => Response.json({}),
      async () => Response.json(null, {status:404}),
    ]) {
      const storage = storageWithCart();
      await assert.rejects(loadStoredCart(storage, fetcher));
      assert.equal(storage.getItem(CART_ID_KEY), activeCart.id);
      assert.equal(storage.getItem(CART_COUNT_KEY), '3');
    }
  });

  await t.test('mutating an expired cart has the same specific missing-cart signal without making writes', async () => {
    state.cart = null;
    for (const action of ['update', 'remove', 'setDelivery', 'checkout']) {
      const response = await POST({ request: new Request('https://example.com/api/cart', {
        method:'POST', headers:{origin:'https://example.com','content-type':'application/json'},
        body:JSON.stringify({action,cartId:activeCart.id,lineId:'gid://shopify/CartLine/old',quantity:1,zip:'22205',slotKey:'2026-12-02:13:00'}),
      }) });
      const result = await response.json();
      assert.equal(response.status, 404);
      assert.equal(result.code, CART_NOT_FOUND);
      assert.equal(isMissingCartResponse(response, result), true);
    }
    assert.equal(state.mutations, 0);
  });

  await t.test('a missing line in an active cart is not treated as an expired cart', async () => {
    state.cart = activeCart;
    const response = await POST({ request: new Request('https://example.com/api/cart', {
      method:'POST', headers:{origin:'https://example.com','content-type':'application/json'},
      body:JSON.stringify({action:'remove',cartId:activeCart.id,lineId:'gid://shopify/CartLine/old'}),
    }) });
    const result = await response.json();
    assert.equal(response.status, 404);
    assert.equal(result.error, 'Cart line not found.');
    assert.equal(isMissingCartResponse(response, result), false);
    assert.equal(state.mutations, 0);
  });
});
