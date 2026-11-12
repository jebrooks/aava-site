import { adminGraphql } from './lib.mjs';
import { syncTourCatalog } from '../../src/lib/shopify/tours.ts';
const dryRun = process.argv.includes('--dry-run');
const result = await syncTourCatalog({
  graphql: adminGraphql,
  locationId: process.env.SHOPIFY_DELIVERY_LOCATION_ID || '',
  publicationId: process.env.SHOPIFY_STOREFRONT_PUBLICATION_ID || '',
  dryRun,
});
console.log(JSON.stringify(result, null, 2));
if ('pending' in result && result.pending > 0) process.exitCode = 2;
