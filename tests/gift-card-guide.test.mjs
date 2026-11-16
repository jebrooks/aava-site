import test from 'node:test';
import assert from 'node:assert/strict';
import { giftCardPriceGuide } from '../src/lib/gift-card-guide.ts';

const variant = (amount, title = 'Default Title', changes = {}) => ({
  title, availableForSale: true, selectedOptions: [], price: { amount: String(amount), currencyCode: 'USD' }, ...changes,
});
const product = (title, variants, changes = {}) => ({ title, isGiftCard: false, tags: ['charcuterie'], servingCount: null, variants: { nodes: variants }, ...changes });
const tours = { enabled: true, seatPrice: '125.00', busPrice: '1250.00', currencyCode: 'USD' };

test('groups serving sizes from Shopify and rounds only the requested small-board guidance', () => {
  const rows = giftCardPriceGuide([
    product('Custom vegetarian (serves 4)', [variant(40)]),
    product('Signature boards', [variant(59, 'Small (serves 4)'), variant(175, 'Large (serves 10)')]),
    product('Custom board (serves 8)', [variant(70)]),
    product('Custom board (serves 15)', [variant(262)]),
    product('Custom board (serves 6)', [variant(62)]),
  ], tours);
  assert.deepEqual(rows.map(row => [row.label, row.minimum.amount, row.approximate]), [
    ['Charcuterie — serves 4', '50.00', true],
    ['Charcuterie — serves 8', '75.00', true],
    ['Charcuterie — serves 10', '175.00', false],
    ['Charcuterie — serves 15', '262.00', false],
    ['Public wine tour — per person', '125.00', false],
    ['Private wine tour — up to 10 people', '1250.00', false],
  ]);
});

test('price changes flow into ranges and tour guidance without fixed price fallbacks', () => {
  const rows = giftCardPriceGuide([
    product('Board (serves 4)', [variant(100)]),
    product('Board (serves 10)', [variant(180), variant(210)]),
  ], { ...tours, seatPrice: '140.00', busPrice: '1400.00' });
  assert.equal(rows[0].minimum.amount, '100.00');
  assert.deepEqual([rows[1].minimum.amount, rows[1].maximum.amount], ['180.00', '210.00']);
  assert.deepEqual(rows.slice(2).map(row => row.minimum.amount), ['140.00', '1400.00']);
  assert.deepEqual(giftCardPriceGuide([], null), []);
  assert.deepEqual(giftCardPriceGuide([], { ...tours, enabled: false }), []);
});

test('excludes unavailable variants, gift cards, tour counterparts and operational products', () => {
  const rows = giftCardPriceGuide([
    product('Gift (serves 4)', [variant(1000)], { isGiftCard: true }),
    product('Delivery (serves 4)', [variant(1000)], { tags: ['delivery-slot'] }),
    product('Tour (serves 4)', [variant(1000)], { tags: ['scheduled-tour'] }),
    product('Board (serves 4)', [variant(59), variant(999, '', { availableForSale: false }),
      variant(999, '', { selectedOptions: [{ name: 'Fulfillment', value: 'On tour' }] }), variant('invalid'), variant(0)]),
  ], null);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].minimum.amount, '50.00');
});

test('variant serving options override product-level servings; metadata supplies missing sizes', () => {
  const rows = giftCardPriceGuide([
    product('Board (serves 15)', [variant(175, 'Default Title', { selectedOptions: [{ name: 'Size', value: 'Large (serves 10)' }] })]),
    product('Board', [variant(70)], { servingCount: { value: '8' } }),
    product('Unspecified board', [variant(500)]),
    product('Board (serves 10-15)', [variant(500)]),
  ], null);
  assert.deepEqual(rows.map(row => row.label), ['Charcuterie — serves 8', 'Charcuterie — serves 10']);
});

test('never combines currencies into one price range', () => {
  const rows = giftCardPriceGuide([product('Board (serves 10)', [variant(175),
    variant(200, '', { price: { amount: '200', currencyCode: 'CAD' } })])], null);
  assert.deepEqual(rows, []);
});
