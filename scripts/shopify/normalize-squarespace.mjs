import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

const args = process.argv.slice(2);
const includeFormer = args.includes('--include-former');
const includeTests = args.includes('--include-tests');
const paths = args.filter((arg) => !arg.startsWith('--'));
const [inputPath, outputPath = 'shopify-catalog.normalized.json'] = paths;
if (!inputPath) {
  throw new Error(
    'Usage: npm run shopify:normalize -- squarespace-products.csv [output.json] [--include-former] [--include-tests]',
  );
}

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' && quoted && source[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const first = (record, names) => names.map((name) => record[name]).find((value) => value?.trim())?.trim() || '';
const slug = (value) => value
  .toLowerCase()
  .trim()
  .replace(/^.*\/p\//, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');
const list = (value) => value.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
const images = (value) => value.split(/[\s,;]+/).map((url) => url.trim()).filter((url) => /^https?:\/\//i.test(url));
const money = (value) => {
  const parsed = Number(String(value).replace(/[$,]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const truthy = (value) => ['1', 'true', 'yes', 'y'].includes(value.trim().toLowerCase());
const cleanOptionValue = (value) => value.replace(/\s*(?::|-|–|—)\s*\$[\d,.]+\s*$/, '').trim();
const legacyUrl = (record) => {
  const productUrl = first(record, ['Product URL', 'URL']);
  if (!productUrl) return '';
  if (/^https?:\/\//i.test(productUrl)) return productUrl;
  const page = first(record, ['Product Page']) || 'charcuterie-menu';
  return `https://www.allaboardva.com/${page.replace(/^\/+|\/+$/g, '')}/p/${productUrl.replace(/^\/+|\/+$/g, '')}`;
};
const optionAt = (record, number) => ({
  name: first(record, [
    `Option Name ${number}`,
    `Option ${number} Name`,
    `Variant Option ${number} Name`,
  ]),
  value: first(record, [
    `Option Value ${number}`,
    `Option ${number} Value`,
    `Variant Option ${number}`,
    `Variant Option ${number} Value`,
  ]),
});

const table = parseCsv(await readFile(inputPath, 'utf8'));
const headers = table.shift()?.map((header) => header.trim()) || [];
const records = table.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])));

const requiredHeaders = ['Title', 'Product URL', 'Price', 'SKU'];
const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
if (missingHeaders.length) {
  throw new Error(`Missing required Squarespace CSV columns: ${missingHeaders.join(', ')}`);
}

const products = [];
const handles = new Set();
const exclusions = { hidden: [], former: [], tests: [], giftCertificates: [] };
let currentProduct = null;

for (const record of records) {
  const title = first(record, ['Product Name', 'Title', 'Name']);
  const productId = first(record, ['Product ID [Non Editable]', 'Product ID']);

  if (title || productId) {
    currentProduct = null;
    const visibility = first(record, ['Status', 'Visibility', 'Visible']).toLowerCase();
    if (['hidden', 'archived', 'false', 'no'].includes(visibility)) {
      exclusions.hidden.push(title || first(record, ['Product URL']) || productId);
      continue;
    }
    if (!title) throw new Error(`Visible Squarespace product ${productId} is missing a title.`);
    if (!includeFormer && /\(former\)/i.test(title)) {
      exclusions.former.push(title);
      continue;
    }
    if (!includeTests && /(^|\W)test(\W|$)/i.test(title)) {
      exclusions.tests.push(title);
      continue;
    }
    if (/gift\s*(certificate|card)/i.test(title)) {
      exclusions.giftCertificates.push(title);
      continue;
    }

    const handle = slug(first(record, ['Product URL', 'URL Slug', 'Handle']) || title);
    if (!handle) throw new Error(`Could not derive a Shopify handle for ${title}.`);
    if (handles.has(handle)) throw new Error(`Duplicate Shopify handle in Squarespace CSV: ${handle}`);
    handles.add(handle);

    const sourceType = first(record, ['Product Type', 'Product Type [Non Editable]', 'Type']);
    const categories = list(first(record, ['Categories']));
    currentProduct = {
      title,
      handle,
      descriptionHtml: first(record, ['Product Description', 'Description']),
      productType: !sourceType || sourceType.toUpperCase() === 'PHYSICAL' ? 'Charcuterie' : sourceType,
      vendor: 'All ABoard VA',
      tags: [...new Set([
        ...list(first(record, ['Product Tags', 'Tags'])),
        ...categories.map((category) => `category:${category.replace(/^\/+/, '')}`),
      ])],
      images: [],
      options: [],
      variants: [],
      metafields: { legacyUrl: legacyUrl(record) },
    };
    products.push(currentProduct);
  }

  // Squarespace leaves product-level cells blank on continuation rows for variants.
  if (!currentProduct) continue;

  currentProduct.images = [...new Set([
    ...currentProduct.images,
    ...images(first(record, ['Hosted Image URLs', 'Images', 'Image URLs', 'Image URL'])),
  ])];

  const variantOptions = Array.from({ length: 6 }, (_, index) => optionAt(record, index + 1))
    .filter(({ name, value }) => name && value)
    .map(({ name, value }) => ({ name, value: cleanOptionValue(value) }));
  for (const { name, value } of variantOptions) {
    let option = currentProduct.options.find((candidate) => candidate.name === name);
    if (!option) {
      option = { name, values: [] };
      currentProduct.options.push(option);
    }
    if (!option.values.includes(value)) option.values.push(value);
  }

  const regularPrice = money(first(record, ['Variant Price', 'Price']));
  const salePrice = money(first(record, ['Sale Price']));
  const onSale = truthy(first(record, ['On Sale'])) && salePrice > 0;
  const rawStock = first(record, ['Stock', 'Quantity', 'Inventory']);
  const inventoryTracked = rawStock !== '' && !/^unlimited$/i.test(rawStock);
  const parsedStock = Number(rawStock);

  currentProduct.variants.push({
    sku: first(record, ['Variant SKU', 'SKU']),
    price: onSale ? salePrice : regularPrice,
    compareAtPrice: onSale && regularPrice > salePrice ? regularPrice : null,
    inventoryTracked,
    inventoryQuantity: inventoryTracked && Number.isFinite(parsedStock) ? Math.max(0, parsedStock) : null,
    optionValues: variantOptions,
  });
}

await writeFile(outputPath, `${JSON.stringify(products, null, 2)}\n`, 'utf8');
console.log(`Normalized ${products.length} products (${products.reduce((sum, product) => sum + product.variants.length, 0)} variants) from ${basename(inputPath)} into ${outputPath}.`);
console.log(`Excluded ${exclusions.hidden.length} hidden, ${exclusions.former.length} former, ${exclusions.tests.length} test, and ${exclusions.giftCertificates.length} gift-certificate products.`);
if (exclusions.giftCertificates.length) {
  console.log('Create Squarespace gift-certificate replacements as native Shopify gift cards; they were not added to this shippable catalog file.');
}
console.log('Review seasonal scope, option names, prices, SKUs, images, tags, and business metafields before importing.');
