import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanServingText, servingSizePlan } from '../scripts/shopify/serving-size-plan.mjs';

const variant = (id, size) => ({ id, selectedOptions: [{ name: 'Size', value: size }], servingCount: null });
const product = changes => ({ id: 'board', handle: 'board', productType: 'Charcuterie', tags: [],
  title: 'Board (Large - serves 10)', description: 'Tasty cheeses. Serves 10.',
  descriptionHtml: '<p>Tasty cheeses. Serves 10. 🌱</p>', servingCount: null,
  options: [], variants: { nodes: [variant('delivery', 'Default Title'), variant('tour', 'Default Title')],
    pageInfo: { hasNextPage: false } }, ...changes });

test('single-size migration uses explicit evidence and retains size names and descriptive HTML', () => {
  const plan = servingSizePlan(product());
  assert.equal(plan.title, 'Board (Large)');
  assert.equal(plan.descriptionHtml, '<p>Tasty cheeses. 🌱</p>');
  assert.deepEqual(plan.metafields.map(({ ownerId, value }) => ({ ownerId, value })), [{ ownerId: 'board', value: '10' }]);
  assert.equal(cleanServingText('Custom board - XXL (serves 15)'), 'Custom board - XXL');
  assert.equal(cleanServingText('Small (serves ~4)'), 'Small');
});

test('multi-size migration populates each existing variant and renames option values in place', () => {
  const plan = servingSizePlan(product({ title: 'Board', description: 'Small (serves 4) or Large (serves 10).',
    options: [{ id: 'size', optionValues: [{ id: 'small', name: 'Small (serves 4)' }, { id: 'large', name: 'Large (serves 10)' }] }],
    variants: { nodes: [variant('small-delivery', 'Small (serves 4)'), variant('small-tour', 'Small (serves 4)'),
      variant('large-delivery', 'Large (serves 10)')], pageInfo: { hasNextPage: false } } }));
  assert.deepEqual(plan.metafields.map(field => [field.ownerId, field.value]),
    [['small-delivery', '4'], ['small-tour', '4'], ['large-delivery', '10']]);
  assert.deepEqual(plan.options[0].values, [{ id: 'small', name: 'Small' }, { id: 'large', name: 'Large' }]);
});

test('migration rejects guesses, conflicting fields, merged choices and incomplete catalogs', () => {
  assert.throws(() => servingSizePlan(product({ title: 'Small board', description: 'Delicious' })), /no unambiguous count/);
  assert.throws(() => servingSizePlan(product({ servingCount: { value: '4' } })), /conflicts/);
  assert.throws(() => servingSizePlan(product({ options: [{ id: 'size', optionValues: [
    { id: 'a', name: 'Small (serves 4)' }, { id: 'b', name: 'Small' }] }] })), /merge/);
  assert.throws(() => servingSizePlan(product({ variants: { nodes: [], pageInfo: { hasNextPage: true } } })), /incomplete/);
});
