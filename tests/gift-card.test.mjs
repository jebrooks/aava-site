import test from 'node:test';
import assert from 'node:assert/strict';
import { giftCardAttributes, assertGiftCardLine, giftCardDateRange } from '../src/lib/gift-card.ts';
import { cartCopyWithLineChange, cartCopyWithAddedLine } from '../src/lib/cart-edit.ts';

const now = new Date('2026-11-15T18:00:00Z');
const recipient = { email: 'friend@example.com', name: 'Friend', message: 'Happy birthday!', sendOn: '2026-12-01', offset: 300 };
const attributes = (changes = {}) => giftCardAttributes(true, { ...recipient, ...changes }, now);

test('maps recipient data to Shopify native properties, including scheduling and timezone', () => {
  assert.deepEqual(attributes(), [
    { key: '__shopify_send_gift_card_to_recipient', value: 'true' },
    { key: 'Recipient email', value: 'friend@example.com' },
    { key: 'Recipient name', value: 'Friend' },
    { key: 'Message', value: 'Happy birthday!' },
    { key: 'Send on', value: '2026-12-01' },
    { key: '__shopify_offset', value: '300' },
  ]);
  assert.doesNotThrow(() => assertGiftCardLine(true, attributes(), now));
});

test('self purchases omit recipient instructions; send now omits the date and optional blank fields', () => {
  assert.deepEqual(giftCardAttributes(true, undefined, now), []);
  assert.deepEqual(giftCardAttributes(false, null, now), []);
  const immediate = attributes({ email: ' friend@example.com ', name: ' ', message: '', sendOn: '' });
  assert.deepEqual(immediate.map(a => a.key), ['__shopify_send_gift_card_to_recipient', 'Recipient email', '__shopify_offset']);
  assert.equal(immediate[1].value, 'friend@example.com');
  assert.doesNotThrow(() => assertGiftCardLine(true, immediate, now));
});

test('rejects recipient data on ordinary products and invalid or oversized recipient fields', () => {
  assert.throws(() => giftCardAttributes(false, recipient, now), /only.*gift card/);
  for (const input of [[], false, 'text']) assert.throws(() => giftCardAttributes(true, input, now));
  for (const email of ['', 'invalid', 'a@', 'a@b', 'a@b.com\r\nBcc: other@example.com', 'a'.repeat(250) + '@example.com', {}]) {
    assert.throws(() => attributes({ email }));
  }
  assert.throws(() => attributes({ name: 'a'.repeat(256) }), /255/);
  assert.throws(() => attributes({ message: 'a'.repeat(201) }), /200/);
  assert.throws(() => attributes({ message: {} }));
  assert.doesNotThrow(() => attributes({ name: 'a'.repeat(255), message: 'a'.repeat(200) }));
});

test('only accepts real calendar dates from today through 90 days ahead', () => {
  assert.doesNotThrow(() => attributes({ sendOn: '2026-11-15' }));
  assert.doesNotThrow(() => attributes({ sendOn: '2027-02-13' }));
  for (const sendOn of ['2026-11-14', '2027-02-14', '2026-11-31', '2027-02-30', '2026-1-1', 'tomorrow', '2026-12-01T08:00', {}]) {
    assert.throws(() => attributes({ sendOn }));
  }
});

test('date bounds follow the purchaser timezone, including midnight and leap days', () => {
  const midnight = new Date('2026-11-15T00:30:00Z');
  assert.equal(giftCardDateRange(300, midnight).min, '2026-11-14');
  assert.equal(giftCardDateRange(-840, midnight).min, '2026-11-15');
  assert.doesNotThrow(() => giftCardAttributes(true, { ...recipient, sendOn: '2026-11-14' }, midnight));
  assert.throws(() => giftCardAttributes(true, { ...recipient, offset: -840, sendOn: '2026-11-14' }, midnight));
  const leap = new Date('2028-02-01T18:00:00Z');
  assert.doesNotThrow(() => giftCardAttributes(true, { ...recipient, sendOn: '2028-02-29' }, leap));
  for (const offset of [undefined, NaN, Infinity, '300', 300.5, -841, 721]) assert.throws(() => attributes({ offset }));
});

test('checkout rejects a saved send date that has passed while allowing self purchases', () => {
  assert.throws(() => assertGiftCardLine(true, attributes(), new Date('2026-12-02T18:00:00Z')), /send date/);
  assert.doesNotThrow(() => assertGiftCardLine(true, [], now));
  assert.throws(() => assertGiftCardLine(false, attributes(), now), /only.*gift card/);
});

test('cart copies preserve each recipient, message and date without changing a validated checkout', () => {
  const first = attributes();
  const second = attributes({ email: 'second@example.com', sendOn: '' });
  const cart = { attributes: [{ key: 'Checkout locked', value: 'true' }], lines: { nodes: [
    { id: 'first', quantity: 1, merchandise: { id: 'gift-card' }, attributes: first },
    { id: 'second', quantity: 1, merchandise: { id: 'gift-card' }, attributes: second },
  ] } };
  const snapshot = structuredClone(cart);
  const updated = cartCopyWithLineChange(cart, 'first', 2);
  assert.deepEqual(updated.lines.map(l => l.attributes), [first, second]);
  const added = cartCopyWithAddedLine(cart, 'gift-card', 1, second);
  assert.deepEqual(added.lines.map(l => l.attributes), [first, second, second]);
  assert.deepEqual(cart, snapshot);
});
