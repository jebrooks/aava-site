import { adminGraphql, ShopifyApiError } from './client';
import type { DeliveryScheduleConfig, DeliverySlot, DeliveryWindow } from './types';

const SCHEDULE_TIMEZONE = 'America/New_York' as const;
const SLOT_TAG = 'delivery-slot';

interface AdminSlotProduct {
  id: string;
  handle: string;
  configuredCapacity: { value: string } | null;
  variants: {
    nodes: Array<{
      id: string;
      title: string;
      inventoryQuantity: number;
      inventoryItem: { id: string };
    }>;
  };
}

function parseStringList(value: string | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // Accept comma/newline separated values as a staff-friendly fallback.
  }
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function validateWindow(window: unknown): window is DeliveryWindow {
  if (!window || typeof window !== 'object') return false;
  const candidate = window as Record<string, unknown>;
  return (
    typeof candidate.label === 'string' &&
    /^\d{2}:\d{2}$/.test(String(candidate.start)) &&
    /^\d{2}:\d{2}$/.test(String(candidate.end)) &&
    String(candidate.start) < String(candidate.end)
  );
}

function validateSchedule(value: unknown): DeliveryScheduleConfig {
  if (!value || typeof value !== 'object') {
    throw new ShopifyApiError('Delivery schedule configuration is invalid.', 500);
  }

  const candidate = value as Partial<DeliveryScheduleConfig>;
  const eligibleZips = Array.isArray(candidate.eligibleZips)
    ? candidate.eligibleZips.map((zip) => String(zip).trim())
    : [];
  if (
    !eligibleZips.length ||
    eligibleZips.some((zip) => !/^\d{5}$/.test(zip)) ||
    new Set(eligibleZips).size !== eligibleZips.length ||
    !Number.isInteger(candidate.dailyCapacity) ||
    Number(candidate.dailyCapacity) < 1 ||
    Number(candidate.dailyCapacity) > 100 ||
    !Number.isInteger(candidate.leadTimeHours) ||
    Number(candidate.leadTimeHours) < 0 ||
    !Number.isInteger(candidate.horizonDays) ||
    Number(candidate.horizonDays) < 1 ||
    Number(candidate.horizonDays) > 90 ||
    !candidate.weeklyWindows ||
    typeof candidate.weeklyWindows !== 'object'
  ) {
    throw new ShopifyApiError('Delivery schedule configuration is incomplete.', 500);
  }

  for (const windows of Object.values(candidate.weeklyWindows)) {
    if (!Array.isArray(windows) || !windows.every(validateWindow)) {
      throw new ShopifyApiError('A delivery time window is invalid.', 500);
    }
  }

  return {
    timezone: SCHEDULE_TIMEZONE,
    eligibleZips,
    dailyCapacity: Number(candidate.dailyCapacity),
    leadTimeHours: Number(candidate.leadTimeHours),
    horizonDays: Number(candidate.horizonDays),
    blackoutDates: Array.isArray(candidate.blackoutDates)
      ? candidate.blackoutDates.map(String)
      : [],
    weeklyWindows: candidate.weeklyWindows,
  };
}

function configFromEnvironment() {
  const raw = import.meta.env.DELIVERY_SCHEDULE_JSON;
  if (!raw) return null;
  try {
    return validateSchedule(JSON.parse(raw));
  } catch (error) {
    if (error instanceof ShopifyApiError) throw error;
    throw new ShopifyApiError('DELIVERY_SCHEDULE_JSON is not valid JSON.', 500);
  }
}

export async function getDeliveryScheduleConfig() {
  try {
    const data = await adminGraphql<{
      metaobjectByHandle: { fields: Array<{ key: string; value: string | null }> } | null;
    }>(`#graphql
      query DeliverySchedule {
        metaobjectByHandle(handle: { type: "delivery_schedule", handle: "default" }) {
          fields { key value }
        }
      }
    `);

    if (data.metaobjectByHandle) {
      const fields = Object.fromEntries(
        data.metaobjectByHandle.fields.map((field) => [field.key, field.value || '']),
      );
      return validateSchedule({
        timezone: SCHEDULE_TIMEZONE,
        eligibleZips: parseStringList(fields.eligible_zips),
        dailyCapacity: Number(fields.daily_capacity),
        leadTimeHours: Number(fields.lead_time_hours),
        horizonDays: Number(fields.horizon_days),
        blackoutDates: parseStringList(fields.blackout_dates),
        weeklyWindows: JSON.parse(fields.weekly_windows || '{}'),
      });
    }
  } catch (error) {
    const fallback = configFromEnvironment();
    if (fallback) return fallback;
    throw error;
  }

  const fallback = configFromEnvironment();
  if (fallback) return fallback;
  throw new ShopifyApiError('Create the delivery_schedule/default Shopify metaobject.', 503);
}

export function normalizeZip(value: string) {
  return value.trim().match(/^\d{5}/)?.[0] || '';
}

function localDateString(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHEDULE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function weekday(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function zonedDateTimeToDate(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: SCHEDULE_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const numberPart = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((item) => item.type === type)?.value || 0);
    const displayedAsUtc = Date.UTC(
      numberPart('year'),
      numberPart('month') - 1,
      numberPart('day'),
      numberPart('hour'),
      numberPart('minute'),
    );
    guess -= displayedAsUtc - target;
  }

  return new Date(guess);
}

export function getEligibleDates(config: DeliveryScheduleConfig, now = new Date()) {
  const dates: Array<{ date: string; windows: DeliveryWindow[] }> = [];
  const today = localDateString(now);
  const earliest = now.getTime() + config.leadTimeHours * 60 * 60 * 1000;

  for (let offset = 0; offset < config.horizonDays; offset += 1) {
    const date = addCalendarDays(today, offset);
    if (config.blackoutDates.includes(date)) continue;
    const windows = (config.weeklyWindows[String(weekday(date))] || []).filter(
      (window) => zonedDateTimeToDate(date, window.start).getTime() >= earliest,
    );
    if (windows.length) dates.push({ date, windows });
  }

  return dates;
}

async function getSlotProducts() {
  const data = await adminGraphql<{
    products: { nodes: AdminSlotProduct[] };
  }>(
    `#graphql
    query DeliverySlotProducts($query: String!) {
      products(first: 250, query: $query) {
        nodes {
          id
          handle
          configuredCapacity: metafield(namespace: "delivery", key: "daily_capacity") { value }
          variants(first: 10) {
            nodes {
              id
              title
              inventoryQuantity
              inventoryItem { id }
            }
          }
        }
      }
    }`,
    { query: `tag:${SLOT_TAG} status:active` },
  );
  return data.products.nodes;
}

export async function getAvailableDeliverySlots(zip: string) {
  const config = await getDeliveryScheduleConfig();
  const normalizedZip = normalizeZip(zip);
  if (!normalizedZip || !config.eligibleZips.includes(normalizedZip)) {
    return { eligible: false, timezone: config.timezone, slots: [] as DeliverySlot[] };
  }

  const products = await getSlotProducts();
  const productsByHandle = new Map(products.map((product) => [product.handle, product]));
  const slots = getEligibleDates(config).flatMap(({ date, windows }) => {
    const product = productsByHandle.get(`delivery-slot-${date}`);
    if (!product) return [];
    const variant = product.variants.nodes[0];
    if (!variant || product.variants.nodes.length !== 1) return [];
    return windows.map((window) => ({
      key: `${date}:${window.start}`,
      date,
      label: window.label,
      start: window.start,
      end: window.end,
      variantId: variant.id,
      available: variant.inventoryQuantity > 0,
    }));
  });

  return { eligible: true, timezone: config.timezone, slots };
}

export async function assertDeliverySlotAvailable(zip: string, variantId: string, slotKey: string) {
  const availability = await getAvailableDeliverySlots(zip);
  const slot = availability.slots.find(
    (candidate) =>
      candidate.variantId === variantId && candidate.key === slotKey && candidate.available,
  );
  if (!availability.eligible) {
    throw new ShopifyApiError('That ZIP code is outside the local-delivery area.', 400);
  }
  if (!slot) {
    throw new ShopifyApiError('That delivery window is no longer available.', 409);
  }
  return slot;
}

interface ProductSetResult {
  productSet: {
    product: { id: string; handle: string } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

async function createSlotProduct(
  date: string,
  dailyCapacity: number,
  locationId: string,
  publicationId: string,
) {
  const handle = `delivery-slot-${date}`;
  const result = await adminGraphql<ProductSetResult>(
    `#graphql
    mutation CreateDeliverySlot(
      $identifier: ProductSetIdentifiers,
      $input: ProductSetInput!
    ) {
      productSet(identifier: $identifier, input: $input, synchronous: true) {
        product { id handle }
        userErrors { field message }
      }
    }`,
    {
      identifier: { handle },
      input: {
        title: `Delivery — ${date}`,
        handle,
        descriptionHtml: '<p>Shared daily capacity for scheduled local delivery.</p>',
        productType: 'Delivery Slot',
        vendor: 'All ABoard VA',
        status: 'ACTIVE',
        tags: [SLOT_TAG],
        metafields: [
          { namespace: 'delivery', key: 'date', type: 'date', value: date },
          {
            namespace: 'delivery',
            key: 'daily_capacity',
            type: 'number_integer',
            value: String(dailyCapacity),
          },
        ],
        productOptions: [
          { name: 'Delivery capacity', values: [{ name: 'Daily order' }] },
        ],
        variants: [{
          optionValues: [{ optionName: 'Delivery capacity', name: 'Daily order' }],
          price: 0,
          taxable: false,
          inventoryItem: { tracked: true, requiresShipping: true },
          inventoryPolicy: 'DENY',
          inventoryQuantities: [
            { locationId, name: 'available', quantity: dailyCapacity },
          ],
        }],
      },
    },
  );

  if (result.productSet.userErrors.length || !result.productSet.product) {
    throw new ShopifyApiError(
      result.productSet.userErrors.map((error) => error.message).join('; ') ||
        `Unable to create delivery slots for ${date}.`,
    );
  }

  const publication = await adminGraphql<{
    publishablePublish: { userErrors: Array<{ message: string }> };
  }>(
    `#graphql
    mutation PublishDeliverySlot($id: ID!, $publicationId: ID!) {
      publishablePublish(id: $id, input: [{ publicationId: $publicationId }]) {
        userErrors { message }
      }
    }`,
    { id: result.productSet.product.id, publicationId },
  );
  if (publication.publishablePublish.userErrors.length) {
    throw new ShopifyApiError(
      publication.publishablePublish.userErrors.map((error) => error.message).join('; '),
    );
  }

  return handle;
}

async function setConfiguredCapacity(productId: string, dailyCapacity: number) {
  const result = await adminGraphql<{
    metafieldsSet: { userErrors: Array<{ message: string }> };
  }>(
    `#graphql
    mutation SetDeliveryCapacity($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { userErrors { message } }
    }`,
    {
      metafields: [{
        ownerId: productId,
        namespace: 'delivery',
        key: 'daily_capacity',
        type: 'number_integer',
        value: String(dailyCapacity),
      }],
    },
  );
  if (result.metafieldsSet.userErrors.length) {
    throw new ShopifyApiError(
      result.metafieldsSet.userErrors.map((error) => error.message).join('; '),
    );
  }
}

async function reconcileDailyCapacity(
  product: AdminSlotProduct,
  dailyCapacity: number,
  locationId: string,
) {
  const previousCapacity = Number(product.configuredCapacity?.value);
  if (!Number.isInteger(previousCapacity) || product.variants.nodes.length !== 1) {
    throw new ShopifyApiError(
      `${product.handle} uses the legacy per-window capacity model and must be migrated before syncing.`,
      409,
    );
  }
  if (previousCapacity === dailyCapacity) return false;

  const variant = product.variants.nodes[0];
  const bookedOrders = Math.max(0, previousCapacity - variant.inventoryQuantity);
  const desiredAvailable = Math.max(0, dailyCapacity - bookedOrders);
  const delta = desiredAvailable - variant.inventoryQuantity;

  if (delta) {
    const result = await adminGraphql<{
      inventoryAdjustQuantities: { userErrors: Array<{ message: string }> };
    }>(
      `#graphql
      mutation AdjustDeliveryCapacity(
        $input: InventoryAdjustQuantitiesInput!
        $idempotencyKey: String!
      ) {
        inventoryAdjustQuantities(input: $input) @idempotent(key: $idempotencyKey) {
          userErrors { message }
        }
      }`,
      {
        input: {
          reason: 'correction',
          name: 'available',
          referenceDocumentUri: `gid://allaboardva/DeliveryCapacity/${product.handle}`,
          changes: [{
            delta,
            inventoryItemId: variant.inventoryItem.id,
            locationId,
            changeFromQuantity: variant.inventoryQuantity,
          }],
        },
        idempotencyKey: `delivery-capacity-${product.handle}-${previousCapacity}-${dailyCapacity}`,
      },
    );
    if (result.inventoryAdjustQuantities.userErrors.length) {
      throw new ShopifyApiError(
        result.inventoryAdjustQuantities.userErrors.map((error) => error.message).join('; '),
      );
    }
  }

  await setConfiguredCapacity(product.id, dailyCapacity);
  return true;
}

async function archiveSlotProduct(id: string) {
  const result = await adminGraphql<ProductSetResult>(
    `#graphql
    mutation ArchiveDeliverySlot($identifier: ProductSetIdentifiers, $input: ProductSetInput!) {
      productSet(identifier: $identifier, input: $input, synchronous: true) {
        product { id handle }
        userErrors { field message }
      }
    }`,
    { identifier: { id }, input: { status: 'ARCHIVED' } },
  );
  if (result.productSet.userErrors.length) {
    throw new ShopifyApiError(
      result.productSet.userErrors.map((error) => error.message).join('; '),
    );
  }
}

export async function materializeDeliverySlots() {
  const locationId = import.meta.env.SHOPIFY_DELIVERY_LOCATION_ID || '';
  const publicationId = import.meta.env.SHOPIFY_STOREFRONT_PUBLICATION_ID || '';
  if (!locationId || !publicationId) {
    throw new ShopifyApiError(
      'SHOPIFY_DELIVERY_LOCATION_ID and SHOPIFY_STOREFRONT_PUBLICATION_ID are required.',
      503,
    );
  }

  const [config, existingProducts] = await Promise.all([
    getDeliveryScheduleConfig(),
    getSlotProducts(),
  ]);
  const today = localDateString(new Date());
  const expiredProducts = existingProducts.filter((product) =>
    product.handle.startsWith('delivery-slot-') && product.handle.slice('delivery-slot-'.length) < today
  );
  for (const product of expiredProducts) await archiveSlotProduct(product.id);

  const existingHandles = new Set(
    existingProducts
      .filter((product) => !expiredProducts.includes(product))
      .map((product) => product.handle),
  );
  const created: string[] = [];
  const capacityUpdated: string[] = [];

  for (const product of existingProducts.filter((item) => !expiredProducts.includes(item))) {
    if (await reconcileDailyCapacity(product, config.dailyCapacity, locationId)) {
      capacityUpdated.push(product.handle);
    }
  }

  const missing = getEligibleDates(config).filter(
    ({ date }) => !existingHandles.has(`delivery-slot-${date}`),
  );
  for (let offset = 0; offset < missing.length; offset += 5) {
    const batch = missing.slice(offset, offset + 5);
    created.push(...await Promise.all(batch.map(({ date }) =>
      createSlotProduct(date, config.dailyCapacity, locationId, publicationId)
    )));
  }

  return {
    created,
    capacityUpdated,
    archived: expiredProducts.map((product) => product.handle),
    existing: existingHandles.size,
    horizonDays: config.horizonDays,
  };
}
