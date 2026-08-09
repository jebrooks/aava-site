import { readFile } from 'node:fs/promises';
import { adminGraphql, assertUserErrors, publishResource } from './lib.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const inputPath = args.find((arg) => !arg.startsWith('--'));
if (!inputPath) throw new Error('Usage: npm run shopify:import -- catalog.normalized.json [--apply]');
const products = JSON.parse(await readFile(inputPath, 'utf8'));
if (!Array.isArray(products)) throw new Error('The normalized catalog must be a JSON array.');

if (!apply) {
  console.log(`Dry run: ${products.length} products are ready for Shopify.`);
  console.log('Re-run with --apply after reviewing the normalized catalog.');
  process.exit(0);
}

const locationId = process.env.SHOPIFY_DELIVERY_LOCATION_ID;
const collectionId = process.env.SHOPIFY_CHARCUTERIE_COLLECTION_ID;
if (!locationId || !collectionId) {
  throw new Error('SHOPIFY_DELIVERY_LOCATION_ID and SHOPIFY_CHARCUTERIE_COLLECTION_ID are required.');
}

for (const product of products) {
  if (!product.title || !product.handle || !Array.isArray(product.variants) || !product.variants.length) {
    throw new Error(`Invalid normalized product: ${product.handle || product.title || 'unknown'}`);
  }
  const options = product.options?.length ? product.options : [{ name: 'Title', values: ['Default Title'] }];
  const data = await adminGraphql(
    `mutation ImportProduct($identifier: ProductSetIdentifiers, $input: ProductSetInput!) {
      productSet(identifier: $identifier, input: $input, synchronous: true) {
        product { id handle }
        userErrors { field message }
      }
    }`,
    {
      identifier: { handle: product.handle },
      input: {
        title: product.title,
        handle: product.handle,
        descriptionHtml: product.descriptionHtml || '',
        productType: product.productType || 'Charcuterie',
        vendor: product.vendor || 'All ABoard VA',
        status: 'ACTIVE',
        tags: [...new Set(['charcuterie', ...(product.tags || [])])],
        collections: [collectionId],
        files: (product.images || []).map((url, index) => ({
          originalSource: url,
          contentType: 'IMAGE',
          alt: `${product.title} image ${index + 1}`,
        })),
        productOptions: options.map((option, index) => ({
          name: option.name,
          position: index + 1,
          values: option.values.map((value) => ({ name: value })),
        })),
        variants: product.variants.map((variant) => {
          const inventoryTracked = variant.inventoryTracked !== false;
          return {
            optionValues: variant.optionValues?.length
              ? variant.optionValues.map((option) => ({ optionName: option.name, name: option.value }))
              : [{ optionName: 'Title', name: 'Default Title' }],
            price: Number(variant.price),
            compareAtPrice: variant.compareAtPrice ? Number(variant.compareAtPrice) : null,
            inventoryItem: { sku: variant.sku || null, tracked: inventoryTracked, requiresShipping: true },
            inventoryPolicy: 'DENY',
            ...(inventoryTracked ? {
              inventoryQuantities: [{
                locationId,
                name: 'available',
                quantity: Number(variant.inventoryQuantity || 0),
              }],
            } : {}),
          };
        }),
        metafields: [
          product.metafields?.servingCount && { namespace: 'custom', key: 'serving_count', type: 'single_line_text_field', value: String(product.metafields.servingCount) },
          product.metafields?.ingredients && { namespace: 'custom', key: 'ingredients', type: 'multi_line_text_field', value: String(product.metafields.ingredients) },
          product.metafields?.allergens && { namespace: 'custom', key: 'allergens', type: 'multi_line_text_field', value: String(product.metafields.allergens) },
          product.metafields?.legacyUrl && { namespace: 'migration', key: 'legacy_url', type: 'url', value: String(product.metafields.legacyUrl) },
        ].filter(Boolean),
      },
    },
  );
  assertUserErrors(data.productSet, `Importing ${product.handle}`);
  await publishResource(data.productSet.product.id);
  console.log(`Imported ${product.handle}`);
}

console.log(`Imported and published ${products.length} products.`);
