import test from 'node:test';
import assert from 'node:assert/strict';
import { boardAttributes, assertBoardLine, getBoardConfiguration } from '../src/lib/board-customization.ts';

const small = 'build-your-own-board-small';
const large = 'build-your-own-board-large';
const selection = (handle, overrides = {}) => {
  const config = getBoardConfiguration(handle);
  return { preference: 'With meat', cheeses: config.cheeses.slice(0, 2), meats: config.meats.slice(0, 1), accompaniments: config.accompaniments.slice(0, 5), ...overrides };
};

test('Small accepts two cheeses, one meat, and five accompaniments', () => {
  const attributes = boardAttributes(small, selection(small));
  assert.equal(attributes.find(a => a.key === 'Cheeses').value, 'Bethmale; Blue');
  assert.doesNotThrow(() => assertBoardLine(small, attributes));
});

test('Small without meat accepts three cheeses and rejects four', () => {
  const config = getBoardConfiguration(small);
  assert.doesNotThrow(() => boardAttributes(small, selection(small, { preference: 'No meat', cheeses: config.cheeses.slice(0, 3), meats: [] })));
  assert.throws(() => boardAttributes(small, selection(small, { preference: 'No meat', cheeses: config.cheeses.slice(0, 4), meats: [] })), /1–3 cheeses/);
});

test('Large accepts its full limits and rejects the old description limits', () => {
  const config = getBoardConfiguration(large);
  const input = selection(large, { cheeses: config.cheeses.slice(0, 3), meats: config.meats.slice(0, 2) });
  assert.doesNotThrow(() => boardAttributes(large, input));
  assert.throws(() => boardAttributes(large, { ...input, cheeses: config.cheeses.slice(0, 4) }), /1–3 cheeses/);
  assert.throws(() => boardAttributes(large, { ...input, accompaniments: config.accompaniments.slice(0, 10) }), /1–5 accompaniments/);
  assert.doesNotThrow(() => boardAttributes(large, { ...input, preference: 'No meat', meats: [], cheeses: config.cheeses.slice(0, 5) }));
  assert.throws(() => boardAttributes(large, { ...input, preference: 'No meat', meats: [], cheeses: config.cheeses.slice(0, 6) }), /1–5 cheeses/);
});

test('invalid, duplicate, missing, and excess ingredients cannot bypass validation', () => {
  for (const input of [undefined, {}, selection(small, { cheeses: ['Invented cheese'] }), selection(small, { cheeses: ['Brie', 'Brie'] }), selection(small, { cheeses: [] }), selection(small, { meats: [] }), selection(small, { accompaniments: [] }), selection(small, { meats: getBoardConfiguration(small).meats.slice(0, 2) }), selection(small, { cheeses: [null] }), selection(small, { preference: 'No meat' })]) {
    assert.throws(() => boardAttributes(small, input));
  }
});

test('reordered identical selections produce identical attributes; different boards remain distinct', () => {
  const input = selection(small);
  const first = boardAttributes(small, input);
  assert.deepEqual(boardAttributes(small, { ...input, cheeses: [...input.cheeses].reverse() }), first);
  assert.notDeepEqual(boardAttributes(small, { ...input, cheeses: ['Brie'] }), first);
});

test('checkout rejects legacy boards without selections and altered ingredient attributes', () => {
  assert.throws(() => assertBoardLine(small, []));
  const attributes = boardAttributes(small, selection(small));
  assert.throws(() => assertBoardLine(small, attributes.map(a => a.key === 'Cheeses' ? { ...a, value: 'Invented cheese' } : a)));
  assert.doesNotThrow(() => assertBoardLine(large, boardAttributes(large, selection(large))));
});

test('ordinary products do not require customization and cannot receive forged selections', () => {
  assert.equal(getBoardConfiguration('great-american-graze'), null);
  assert.deepEqual(boardAttributes('great-american-graze', undefined), []);
  assert.throws(() => boardAttributes('great-american-graze', selection(small)));
  assert.doesNotThrow(() => assertBoardLine('great-american-graze', []));
});
