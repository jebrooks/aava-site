import { readFile, writeFile } from 'node:fs/promises';
import { adminGraphql, assertUserErrors } from './lib.mjs';
import { servingSizePlan, cleanProductTitle } from './serving-size-plan.mjs';

const args = process.argv.slice(2);
const phase = args.find(arg => arg.startsWith('--phase='))?.slice(8) || 'plan';
const snapshot = args.find(arg => arg.startsWith('--snapshot='))?.slice(11);
if (!snapshot || !['plan', 'fields', 'cleanup'].includes(phase)) {
  throw new Error('Use --phase=plan|fields|cleanup --snapshot=/absolute/path.json. Plan is read-only; fields/cleanup write to Shopify.');
}

const fields = `id title handle status productType tags description descriptionHtml
 servingCount:metafield(namespace:"custom",key:"serving_count"){value compareDigest}
 options{id name optionValues{id name}}
 variants(first:100){nodes{id title price selectedOptions{name value}
   servingCount:metafield(namespace:"custom",key:"serving_count"){value compareDigest}
   source:metafield(namespace:"tour",key:"source_variant"){value}
   inventoryItem{id tracked requiresShipping}}
   pageInfo{hasNextPage}}`;

async function currentProduct(id) {
  return (await adminGraphql(`query($id:ID!){product(id:$id){${fields}}}`, { id })).product;
}

if (phase === 'plan') {
  const products = [];
  let after = null;
  do {
    const data = await adminGraphql(`query($after:String){products(first:100,after:$after,query:"product_type:Charcuterie"){
      nodes{${fields}} pageInfo{hasNextPage endCursor}}}`, { after });
    products.push(...data.products.nodes);
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after);
  const plans = products.map(servingSizePlan);
  await writeFile(snapshot, JSON.stringify(plans, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(plans.map(plan => ({ handle: plan.handle, title: plan.title,
    counts: plan.counts, fields: plan.metafields.length, optionRenames: plan.options.length,
    descriptionChanged: plan.descriptionHtml !== plan.before.descriptionHtml })), null, 2));
  process.exit(0);
}

const plans = JSON.parse(await readFile(snapshot, 'utf8'))
  .map(plan => ({ ...plan, title: cleanProductTitle(plan.before.title) }));
if (phase === 'fields') {
  // Serving counts are customer-facing product information, explicitly exposed to Headless.
  for (const ownerType of ['PRODUCT', 'PRODUCTVARIANT']) {
    const { metafieldDefinition: existing } = await adminGraphql(`query($identifier:MetafieldDefinitionIdentifierInput!){
      metafieldDefinition(identifier:$identifier){id type{name} access{storefront}}}`, {
      identifier: { namespace: 'custom', key: 'serving_count', ownerType },
    });
    if (existing && existing.type.name !== 'single_line_text_field') throw new Error(`Unexpected ${ownerType} serving field type.`);
    if (existing) {
      const result = await adminGraphql(`mutation($definition:MetafieldDefinitionUpdateInput!){
        metafieldDefinitionUpdate(definition:$definition){updatedDefinition{id} userErrors{field message}}}`, {
        definition: { namespace: 'custom', key: 'serving_count', ownerType, access: { storefront: 'PUBLIC_READ' } },
      });
      assertUserErrors(result.metafieldDefinitionUpdate, 'Expose serving field');
    } else {
      const result = await adminGraphql(`mutation($definition:MetafieldDefinitionInput!){
        metafieldDefinitionCreate(definition:$definition){createdDefinition{id} userErrors{field message}}}`, {
        definition: { name: 'Serving count', namespace: 'custom', key: 'serving_count', ownerType,
          type: 'single_line_text_field', description: 'Number of people served by one board. Enter a positive whole number.',
          access: { storefront: 'PUBLIC_READ' } },
      });
      assertUserErrors(result.metafieldDefinitionCreate, 'Create serving field');
    }
  }
}

if (phase === 'cleanup') {
  const origin = args.find(arg => arg.startsWith('--production-url='))?.slice(17);
  if (!origin || new URL(origin).protocol !== 'https:') throw new Error('Cleanup requires --production-url=https://<production-host> after deployment.');
  // Guard against removing serving information before the production site can display the fields.
  for (const plan of [plans.find(plan => plan.counts.length === 1 && plan.before.status === 'ACTIVE'),
    plans.find(plan => plan.counts.length > 1 && plan.before.status === 'ACTIVE')]) {
    if (!plan) throw new Error('Both single-size and multi-size production examples are required.');
    const response = await fetch(new URL(`/charcuterie-menu/p/${plan.handle}`, origin));
    const html = await response.text();
    if (!response.ok || !html.includes('data-serving-count') || !html.includes('data-product-serving-count')) {
      throw new Error('Production product page does not yet support the serving-size fields. Deploy the PR before cleanup.');
    }
  }
}

for (const plan of plans) {
  const product = await currentProduct(plan.id);
  const optionsUnchangedOrCleaned = product?.options.length === plan.before.options.length &&
    product.options.every((option, index) => {
      const before = plan.before.options[index];
      const renames = plan.options.find(change => change.id === option.id)?.values || [];
      return option.id === before.id && option.name === before.name &&
        option.optionValues.length === before.optionValues.length && option.optionValues.every((value, i) =>
          value.id === before.optionValues[i].id && (value.name === before.optionValues[i].name ||
            (phase === 'cleanup' && value.name === renames.find(rename => rename.id === value.id)?.name)));
    });
  if (!product || product.handle !== plan.handle ||
    ![plan.before.title, ...(phase === 'cleanup' ? [plan.title] : [])].includes(product.title) ||
    ![plan.before.descriptionHtml, ...(phase === 'cleanup' ? [plan.descriptionHtml] : [])].includes(product.descriptionHtml) ||
    !optionsUnchangedOrCleaned ||
    JSON.stringify(product.variants.nodes.map(v => ({ id: v.id, price: v.price, inventory: v.inventoryItem, source: v.source }))) !==
    JSON.stringify(plan.before.variants.nodes.map(v => ({ id: v.id, price: v.price, inventory: v.inventoryItem, source: v.source })))) {
    throw new Error(`${plan.handle}: product changed since the snapshot; stop and make a new plan.`);
  }
  if (phase === 'fields') {
    const writes = plan.metafields.filter(field => {
      const current = field.ownerId === product.id ? product.servingCount
        : product.variants.nodes.find(variant => variant.id === field.ownerId)?.servingCount;
      if (current?.value === field.value) return false;
      if (current?.value !== field.current?.value) throw new Error(`${plan.handle}: serving field changed since snapshot.`);
      return true;
    });
    for (let i = 0; i < writes.length; i += 25) {
      const result = await adminGraphql(`mutation($metafields:[MetafieldsSetInput!]!){metafieldsSet(metafields:$metafields){
        metafields{id} userErrors{field message}}}`, { metafields: writes.slice(i, i + 25).map(field => ({
        ownerId: field.ownerId, namespace: 'custom', key: 'serving_count', type: 'single_line_text_field', value: field.value,
        compareDigest: field.current?.compareDigest || null,
      })) });
      assertUserErrors(result.metafieldsSet, `Populate ${plan.handle}`);
    }
  } else {
    for (const field of plan.metafields) {
      const current = field.ownerId === product.id ? product.servingCount
        : product.variants.nodes.find(variant => variant.id === field.ownerId)?.servingCount;
      if (current?.value !== field.value) throw new Error(`${plan.handle}: populate and verify serving fields before cleanup.`);
    }
    if (plan.title !== product.title || plan.descriptionHtml !== product.descriptionHtml) {
      const result = await adminGraphql(`mutation($product:ProductUpdateInput!){productUpdate(product:$product){
        product{id} userErrors{field message}}}`, {
        product: { id: product.id, handle: product.handle, title: plan.title, descriptionHtml: plan.descriptionHtml },
      });
      assertUserErrors(result.productUpdate, `Clean ${plan.handle}`);
    }
    for (const option of plan.options) {
      const result = await adminGraphql(`mutation($productId:ID!,$option:OptionUpdateInput!,$values:[OptionValueUpdateInput!]!){
        productOptionUpdate(productId:$productId,option:$option,optionValuesToUpdate:$values,variantStrategy:LEAVE_AS_IS){
          product{id} userErrors{field message}}}`, {
        productId: product.id, option: { id: option.id }, values: option.values,
      });
      assertUserErrors(result.productOptionUpdate, `Rename size values for ${plan.handle}`);
    }
    const after = await currentProduct(plan.id);
    if (JSON.stringify(after.variants.nodes.map(v => ({ id: v.id, price: v.price, inventory: v.inventoryItem, source: v.source }))) !==
      JSON.stringify(product.variants.nodes.map(v => ({ id: v.id, price: v.price, inventory: v.inventoryItem, source: v.source })))) {
      throw new Error(`${plan.handle}: unexpected commerce change after cleanup; stop.`);
    }
  }
  console.log(`${phase}: ${plan.handle}`);
}
