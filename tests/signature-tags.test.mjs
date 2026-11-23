import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

test('signature selection uses exact Shopify tags from the loaded catalog', async t => {
  const server = await createServer({ configFile: false,
    server: { middlewareMode: true, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  t.after(() => server.close());
  const { selectSignatureBoards } = await server.ssrLoadModule('/src/lib/shopify/storefront.ts');
  const signatures = Array.from({ length: 10 }, (_, i) => ({
    handle: `board-${i}`, tags: ['charcuterie', 'category:signature-boards'],
  }));
  const others = [
    { handle: 'dessert', tags: ['charcuterie', 'category:dessert'] },
    { handle: 'almost', tags: ['category:signature-boards-extra'] },
    { handle: 'untagged', tags: [] },
  ];
  const catalog = [others[0], ...signatures.slice(0, 4), ...others.slice(1), ...signatures.slice(4)];
  const before = structuredClone(catalog);
  const result = selectSignatureBoards(catalog);
  assert.deepEqual(result, signatures, 'all matching products retain catalog order, without an eight-card limit');
  assert.strictEqual(result[0], signatures[0], 'reuse the catalog products');
  assert.deepEqual(catalog, before, 'selection preserves the full menu');
  assert.deepEqual(selectSignatureBoards(others), [], 'no unrelated fallback');
  assert.deepEqual(selectSignatureBoards([]), []);
});
