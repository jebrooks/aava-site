import { adminGraphql, assertUserErrors, shopifyEnvironment } from './lib.mjs';

// Deploy the reservation-free storefront first. Archive products, preserving order history.
const apply = process.argv.includes('--apply');
const site = process.argv.find(arg => arg.startsWith('--site='))?.slice(7) || 'https://aava-site.vercel.app';
const schedule = await adminGraphql(`query {
  metaobjectByHandle(handle: {type: "delivery_schedule", handle: "default"}) { fields { key value } }
}`);
const fields = Object.fromEntries((schedule.metaobjectByHandle?.fields || []).map(f => [f.key, f.value]));
const zip = fields.eligible_zips?.match(/\d{5}/)?.[0];
if (!zip) throw new Error('No delivery ZIP configured.');
if (apply) {
  const response = await fetch(new URL(`/api/delivery/availability?zip=${zip}`, site));
  const availability = await response.json();
  if (!response.ok || !availability.eligible || availability.blackoutSource !== 'booking_blackouts/default' ||
    !availability.slots?.length || availability.slots.some(slot => 'variantId' in slot || !slot.available)) {
    throw new Error('Deploy and verify reservation-free delivery availability on Production before archiving products.');
  }
}
const products = [];
let after = null;
do {
  const data = await adminGraphql(`query LegacyDeliveryProducts($after: String) {
    products(first: 100, after: $after, query: "tag:delivery-slot") {
      nodes { id handle status }
      pageInfo { hasNextPage endCursor }
    }
  }`, { after });
  for (const product of data.products.nodes) {
    if (!/^delivery-slot-\d{4}-\d{2}-\d{2}$/.test(product.handle)) {
      throw new Error(`Unexpected delivery product handle: ${product.handle}`);
    }
    products.push(product);
  }
  after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  if (data.products.pageInfo.hasNextPage && !after) throw new Error('Missing Shopify product cursor.');
} while (after);
const pending = products.filter(product => product.status !== 'ARCHIVED');
console.log(JSON.stringify({ store: shopifyEnvironment().store, apply, total: products.length, archive: pending.length }));
for (const product of pending) {
  if (!apply) continue;
  const result = await adminGraphql(`mutation RetireDeliveryReservation($product: ProductUpdateInput!) {
    productUpdate(product: $product) { product { id status } userErrors { message } }
  }`, { product: { id: product.id, status: 'ARCHIVED' } });
  assertUserErrors(result.productUpdate, `Archiving ${product.handle}`);
}
console.log(apply ? 'Legacy delivery reservations archived; orders and inventory history preserved.' : 'Read-only plan. Deploy first, then rerun with --apply.');
