import { randomUUID } from 'node:crypto';
import {
  TOUR_TAG, TOUR_CAPACITY, parseTourSchedule, eligibleTourDates,
  localTourDate, addDays, managedTourDate, tourHandle,
} from '../tour-schedule.ts';

export type TourGraphql = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
interface Errors { userErrors: Array<{ message: string; code?: string }> }
interface Variant {
  id: string; price: string; inventoryQuantity: number; inventoryPolicy: string; requiresComponents: boolean;
  inventoryItem: { id: string; tracked: boolean; requiresShipping: boolean };
  productVariantComponents: { nodes: Array<{ quantity: number; productVariant: { id: string } }> };
}
interface Product {
  id: string; handle: string; status: string; tags: string[];
  date: { value: string } | null;
  publishedOnPublication: boolean;
  variants: { nodes: Variant[] };
}
const productFields = `id handle status tags
  date: metafield(namespace:"tour",key:"date"){value}
  publishedOnPublication(publicationId:$publicationId)
  variants(first:2){nodes{id price inventoryQuantity inventoryPolicy requiresComponents
    inventoryItem{id tracked requiresShipping}
    productVariantComponents(first:2){nodes{quantity productVariant{id}}}
  }}`;
function checked<T extends Errors>(result: T, operation: string): T {
  if (result.userErrors.length) throw new Error(`${operation}: ${result.userErrors.map(e => e.message).join('; ')}`);
  return result;
}
async function loadProducts(graphql: TourGraphql, publicationId: string) {
  const products: Product[] = [];
  let after: string | null = null;
  do {
    const result: { products: { nodes: Product[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } =
      await graphql(`query TourProducts($after:String,$publicationId:ID!){
        products(first:100,after:$after,query:"tag:${TOUR_TAG}"){
          nodes{${productFields}} pageInfo{hasNextPage endCursor}
        }
      }`, { after, publicationId });
    products.push(...result.products.nodes);
    after = result.products.pageInfo.hasNextPage ? result.products.pageInfo.endCursor : null;
  } while (after);
  for (const product of products) {
    const date = managedTourDate(product.handle);
    if (!date || date !== product.date?.value || product.variants.nodes.length !== 1) {
      throw new Error(`Unexpected managed tour product ${product.handle}. Sync stopped to protect inventory.`);
    }
  }
  return products;
}
async function setStatus(graphql: TourGraphql, product: Product, status: 'ACTIVE' | 'ARCHIVED') {
  if (product.status === status) return;
  const result = await graphql<{ productUpdate: Errors }>(`mutation TourStatus($product:ProductUpdateInput!){
    productUpdate(product:$product){userErrors{message}}
  }`, { product: { id: product.id, status } });
  checked(result.productUpdate, `Setting ${product.handle} ${status}`);
  product.status = status;
}
async function ensurePublished(graphql: TourGraphql, product: Product, publicationId: string) {
  if (product.publishedOnPublication) return;
  const result = await graphql<{ publishablePublish: Errors }>(`mutation PublishTour($id:ID!,$publicationId:ID!){
    publishablePublish(id:$id,input:[{publicationId:$publicationId}]){userErrors{message}}
  }`, { id: product.id, publicationId });
  checked(result.publishablePublish, `Publishing ${product.handle}`);
  product.publishedOnPublication = true;
}
async function ensureProduct(
  graphql: TourGraphql, map: Map<string, Product>, kind: 'seat' | 'bus', date: string,
  price: string, locationId: string, publicationId: string,
): Promise<Product> {
  const handle = tourHandle(kind, date);
  const existing = map.get(handle);
  if (existing) return existing;
  // A deterministic handle makes retrying safe; never overwrite a merchant-owned collision.
  const lookup = await graphql<{ productByHandle: Product | null }>(`query TourByHandle($handle:String!,$publicationId:ID!){
    productByHandle(handle:$handle){${productFields}}
  }`, { handle, publicationId });
  if (lookup.productByHandle) throw new Error(`Handle ${handle} already exists outside the managed catalog.`);
  const result = await graphql<{ productSet: Errors & { product: Product | null } }>(`mutation CreateTour($input:ProductSetInput!,$publicationId:ID!){
    productSet(input:$input,synchronous:true){product{${productFields}} userErrors{message}}
  }`, { publicationId, input: {
    handle, title: `${kind === 'seat' ? 'Public tour seat' : 'Whole bus tour'} — ${date}`,
    descriptionHtml: kind === 'seat'
      ? `<p>One public winery tour seat on ${date}. Up to 10 guests share this departure.</p>`
      : `<p>Exclusive winery tour bus for up to 10 guests on ${date}.</p>`,
    status: 'DRAFT', vendor: 'All ABoard VA', productType: kind === 'seat' ? 'Tour Seat' : 'Tour Bus',
    tags: [TOUR_TAG, 'tour', `tour-${kind}`],
    metafields: [
      { namespace: 'tour', key: 'date', type: 'date', value: date },
      { namespace: 'tour', key: 'capacity', type: 'number_integer', value: String(TOUR_CAPACITY) },
    ],
    productOptions: [{ name: 'Booking', values: [{ name: kind === 'seat' ? 'Seat' : 'Whole bus' }] }],
    variants: [{
      optionValues: [{ optionName: 'Booking', name: kind === 'seat' ? 'Seat' : 'Whole bus' }],
      price, inventoryPolicy: 'DENY', requiresComponents: kind === 'bus',
      inventoryItem: { tracked: kind === 'seat', requiresShipping: false },
      ...(kind === 'seat' ? { inventoryQuantities: [{ locationId, name: 'available', quantity: TOUR_CAPACITY }] } : {}),
    }],
  } });
  checked(result.productSet, `Creating ${handle}`);
  if (!result.productSet.product) throw new Error(`Shopify did not return ${handle}.`);
  map.set(handle, result.productSet.product);
  return result.productSet.product;
}
async function ensureBundle(graphql: TourGraphql, bus: Product, seat: Product) {
  const parent = bus.variants.nodes[0];
  const child = seat.variants.nodes[0];
  const components = parent.productVariantComponents.nodes;
  if (components.length) {
    if (components.length !== 1 || components[0].productVariant.id !== child.id || components[0].quantity !== TOUR_CAPACITY) {
      throw new Error(`${bus.handle} has unexpected components. No inventory was changed.`);
    }
  } else {
    const result = await graphql<{ productVariantRelationshipBulkUpdate: Errors & { parentProductVariants: Variant[] } }>(
      `mutation TourBundle($input:[ProductVariantRelationshipUpdateInput!]!){
        productVariantRelationshipBulkUpdate(input:$input){
          parentProductVariants{id productVariantComponents(first:2){nodes{quantity productVariant{id}}}}
          userErrors{message}
        }
      }`, { input: [{ parentProductVariantId: parent.id, productVariantRelationshipsToCreate: [{ id: child.id, quantity: TOUR_CAPACITY }] }] },
    );
    checked(result.productVariantRelationshipBulkUpdate, `Linking ${bus.handle}`);
    const linked = result.productVariantRelationshipBulkUpdate.parentProductVariants?.[0]?.productVariantComponents.nodes;
    if (linked?.length !== 1 || linked[0].quantity !== TOUR_CAPACITY || linked[0].productVariant.id !== child.id) {
      throw new Error(`Bundle verification failed for ${bus.handle}; products were not activated.`);
    }
  }
  if (!child.inventoryItem.tracked || child.inventoryPolicy !== 'DENY' || child.inventoryItem.requiresShipping || parent.inventoryItem.requiresShipping || !parent.requiresComponents) {
    throw new Error(`${bus.handle} or its seat inventory has unsafe inventory settings.`);
  }
}
async function updatePrice(graphql: TourGraphql, product: Product, price: string) {
  if (Number(product.variants.nodes[0].price) === Number(price)) return;
  const result = await graphql<{ productVariantsBulkUpdate: Errors }>(`mutation TourPrice($id:ID!,$variants:[ProductVariantsBulkInput!]!){
    productVariantsBulkUpdate(productId:$id,variants:$variants){userErrors{message}}
  }`, { id: product.id, variants: [{ id: product.variants.nodes[0].id, price }] });
  checked(result.productVariantsBulkUpdate, `Pricing ${product.handle}`);
}

interface Lock { shop: { id: string; metafield: { value: string; compareDigest: string } | null } }
async function readLock(graphql: TourGraphql): Promise<Lock['shop']> {
  return (await graphql<Lock>(`query TourSyncLock{shop{id metafield(namespace:"tour_scheduler",key:"sync_lock"){value compareDigest}}}`)).shop;
}
async function writeLock(graphql: TourGraphql, shop: Lock['shop'], value: string) {
  return graphql<{ metafieldsSet: Errors }>(`mutation TourSyncLock($input:[MetafieldsSetInput!]!){
    metafieldsSet(metafields:$input){userErrors{code message}}
  }`, { input: [{ ownerId: shop.id, namespace: 'tour_scheduler', key: 'sync_lock', type: 'json',
    value, compareDigest: shop.metafield?.compareDigest ?? null }] });
}
export async function syncTourCatalog(options: {
  graphql: TourGraphql; locationId: string; publicationId: string;
  now?: Date; maxRunMs?: number; dryRun?: boolean;
}) {
  const { graphql: request, locationId, publicationId } = options;
  const graphql: TourGraphql = async (query, variables) => {
    for (let attempt = 0; ; attempt++) {
      try { return await request(query, variables); }
      catch (error) {
        if (attempt >= 5 || !(error instanceof Error) || !/throttled|HTTP 429/i.test(error.message)) throw error;
        await new Promise(resolve => setTimeout(resolve, Math.min(8_000, 750 * 2 ** attempt)));
      }
    }
  };
  if (!locationId || !publicationId) throw new Error('Tour location and publication must be configured.');
  const now = options.now || new Date();
  const result = await graphql<{ metaobjectByHandle: { fields: Array<{ key: string; value: string | null }> } | null }>(
    `query TourSchedule{metaobjectByHandle(handle:{type:"tour_schedule",handle:"default"}){fields{key value}}}`,
  );
  if (!result.metaobjectByHandle) throw new Error('Create the tour_schedule/default Shopify metaobject first.');
  const config = parseTourSchedule(Object.fromEntries(result.metaobjectByHandle.fields.map(f => [f.key, f.value || ''])));
  // Close the coming day's cutoff before midnight. This accommodates UTC cron timing and DST.
  const closingDay = localTourDate(new Date(now.getTime() + 2 * 60 * 60 * 1000));
  const earliest = addDays(closingDay, config.minimumDays);
  const dates = eligibleTourDates(config, now).filter(date => date >= earliest);
  const eligible = new Set(dates);
  const started = Date.now();
  const maxRunMs = options.maxRunMs || 240_000;
  const token = randomUUID();
  if (!options.dryRun) {
    const shop = await readLock(graphql);
    if (shop.metafield && JSON.parse(shop.metafield.value).expiresAt > Date.now()) {
      return { busy: true, created: [], archived: [], reopened: [], pending: 0 };
    }
    const lock = await writeLock(graphql, shop, JSON.stringify({ token, expiresAt: Date.now() + 10 * 60_000 }));
    if (lock.metafieldsSet.userErrors.some(e => e.code === 'STALE_OBJECT' || e.code === 'COMPARE_DIGEST_MISMATCH')) {
      return { busy: true, created: [], archived: [], reopened: [], pending: 0 };
    }
    checked(lock.metafieldsSet, 'Acquiring tour sync lock');
  }
  try {
    const products = await loadProducts(graphql, publicationId);
    const map = new Map(products.map(product => [product.handle, product]));
    const closing = products.filter(p => !eligible.has(managedTourDate(p.handle)!) && p.status !== 'ARCHIVED')
      .sort((a, b) => a.handle.localeCompare(b.handle)); // bus before seat
    const created: string[] = [];
    const archived: string[] = [];
    const reopened: string[] = [];
    if (options.dryRun) return {
      dryRun: true, earliest, dates,
      create: dates.flatMap(date => (['seat', 'bus'] as const).map(kind => tourHandle(kind, date))).filter(handle => !map.has(handle)),
      archive: closing.map(p => p.handle),
    };
    // Closing runs before creation, so reaching the execution budget cannot defer expired dates.
    for (const product of closing) {
      await setStatus(graphql, product, 'ARCHIVED');
      archived.push(product.handle);
    }
    let processed = 0;
    const syncDate = async (date: string) => {
      const handles = [tourHandle('seat', date), tourHandle('bus', date)];
      const wasMissing = handles.filter(handle => !map.has(handle));
      const pair = await Promise.allSettled([
        ensureProduct(graphql, map, 'seat', date, config.seatPrice, locationId, publicationId),
        ensureProduct(graphql, map, 'bus', date, config.busPrice, locationId, publicationId),
      ]);
      const failed = pair.find(result => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
      const [seat, bus] = pair.map(result => {
        if (result.status === 'rejected') throw result.reason;
        return result.value;
      });
      // A malformed pair is taken off sale before surfacing the error.
      try { await ensureBundle(graphql, bus, seat); }
      catch (error) {
        await setStatus(graphql, bus, 'ARCHIVED');
        await setStatus(graphql, seat, 'ARCHIVED');
        throw error;
      }
      await updatePrice(graphql, seat, config.seatPrice);
      await updatePrice(graphql, bus, config.busPrice);
      for (const product of [seat, bus]) {
        if (product.status === 'ARCHIVED') reopened.push(product.handle);
        await setStatus(graphql, product, 'ACTIVE');
        await ensurePublished(graphql, product, publicationId);
      }
      created.push(...wasMissing);
      processed++;
    };
    for (let offset = 0; offset < dates.length; offset += 4) {
      if (Date.now() - started > maxRunMs) break;
      const results = await Promise.allSettled(dates.slice(offset, offset + 4).map(syncDate));
      const failure = results.find(result => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    }
    const summary = { busy: false, created, archived, reopened, pending: dates.length - processed, dates: dates.length, earliest };
    console.info(JSON.stringify({ event: 'tour_catalog_sync', ...summary }));
    return summary;
  } finally {
    if (!options.dryRun) {
      const shop = await readLock(graphql);
      if (shop.metafield && JSON.parse(shop.metafield.value).token === token) {
        const released = await writeLock(graphql, shop, JSON.stringify({ token, expiresAt: 0 }));
        checked(released.metafieldsSet, 'Releasing tour sync lock');
      }
    }
  }
}
