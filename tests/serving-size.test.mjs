import test from 'node:test';
import assert from 'node:assert/strict';
import { servingCount, productServingLabel, servingAttributes, variantServingLabel } from '../src/lib/serving-size.ts';
import { cartCopyWithServingCounts, cartCopyWithLineChange } from '../src/lib/cart-edit.ts';

const field = value => ({ servingCount: { value: String(value) } });

test('serving fields supply single sizes and variant-specific sizes without reading names', () => {
  assert.equal(servingCount(field(10)), 10);
  assert.equal(servingCount(field(10), field(4)), 4);
  assert.equal(servingCount({ title: 'Board (serves 10)' }, { title: 'Small (serves 4)' }), null);
  for (const value of ['0', '-1', '4.5', 'serves 4', '4 or 10', '9007199254740992']) {
    assert.equal(servingCount(field(value)), null);
  }
  assert.equal(servingCount({}, field('bad')), null);
});

test('catalog labels describe all distinct variant sizes in numeric order', () => {
  assert.equal(productServingLabel({ ...field(10), variants: { nodes: [{}, {}] } }), 'Serves 10');
  assert.equal(productServingLabel({ variants: { nodes: [field(10), field(4), field(10)] } }), 'Serves 4 or 10');
  assert.equal(productServingLabel({ variants: { nodes: [{ title: 'Serves 4' }] } }), '');
  assert.deepEqual(servingAttributes(field(10), field(4)), [{ key: 'Serves', value: '4' }]);
  assert.equal(variantServingLabel({}, { title: 'Small (serves 4)', ...field(4) }), 'Small — serves 4');
  assert.equal(variantServingLabel({}, { title: 'Large', ...field(10) }), 'Large — serves 10');
});

test('legacy-cart repair stamps trusted counts while preserving checkout, delivery and gift details', () => {
  const board = { id: 'board-line', quantity: 2, attributes: [{ key: 'Cheeses', value: 'Brie' }, { key: 'Serves', value: '999' }],
    merchandise: { id: 'board', ...field(4), product: { handle: 'board', isGiftCard: false } } };
  const gift = { id: 'gift-line', quantity: 1, attributes: [{ key: 'Recipient email', value: 'gift@example.com' }],
    merchandise: { id: 'gift', product: { handle: 'gift-card', isGiftCard: true } } };
  const delivery = { id: 'slot-line', quantity: 1, attributes: [],
    merchandise: { id: 'slot', product: { handle: 'delivery-slot-2026-12-01', isGiftCard: false } } };
  const cart = { attributes: [{ key: 'Checkout locked', value: 'true' }, { key: 'Delivery ZIP', value: '22205' }],
    lines: { nodes: [board, gift, delivery] } };
  const original = structuredClone(cart);
  const copy = cartCopyWithServingCounts(cart);
  assert.deepEqual(copy.attributes, [{ key: 'Delivery ZIP', value: '22205' }]);
  assert.deepEqual(copy.lines[0], { merchandiseId: 'board', quantity: 2,
    attributes: [{ key: 'Cheeses', value: 'Brie' }, { key: 'Serves', value: '4' }] });
  assert.deepEqual(copy.lines[1].attributes, gift.attributes);
  assert.equal(copy.lines[2].merchandiseId, 'slot');
  assert.deepEqual(cart, original);
  cart.lines.nodes[0].attributes = copy.lines[0].attributes;
  assert.equal(cartCopyWithServingCounts(cart), null, 'An up-to-date cart needs no extra copy');
  assert.deepEqual(cartCopyWithLineChange(cart, 'board-line', 3).lines[0].attributes, copy.lines[0].attributes);
  delete cart.lines.nodes[0].merchandise.servingCount;
  assert.deepEqual(cartCopyWithServingCounts(cart).lines[0].attributes, [{ key: 'Cheeses', value: 'Brie' }],
    'Stale serving claims are removed if the authoritative field is cleared');
});
