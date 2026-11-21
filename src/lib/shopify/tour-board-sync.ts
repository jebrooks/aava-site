import { randomUUID } from "node:crypto";
import {
  isTourVariant,
  FULFILLMENT_OPTION,
  TOUR_FULFILLMENT,
  DELIVERY_FULFILLMENT,
} from "../tour-fulfillment.ts";
import type { TourGraphql } from "./tours.ts";
export interface SyncVariant {
  id: string;
  price: string;
  compareAtPrice: string | null;
  taxable: boolean;
  taxCode: string | null;
  inventoryPolicy: string;
  selectedOptions: Array<{ name: string; value: string }>;
  inventoryItem: {
    id?: string;
    tracked: boolean;
    requiresShipping: boolean;
    sku: string | null;
    inventoryLevels?: {
      nodes: Array<{ id?: string; location: { id: string } }>;
      pageInfo?: { hasNextPage: boolean };
    };
  };
  source: { value: string } | null;
  servingCount?: { value: string } | null;
}
export interface SyncProduct {
  id: string;
  handle: string;
  options: Array<{ id: string; name: string }>;
  collections: { nodes: Array<{ handle: string }> };
  variants: { nodes: SyncVariant[]; pageInfo: { hasNextPage: boolean } };
  lock: { value: string; compareDigest: string } | null;
}
const fields = `id handle options{id name} collections(first:100){nodes{handle}}
  lock:metafield(namespace:"tour",key:"variant_sync_lock"){value compareDigest}
  variants(first:100){nodes{id price compareAtPrice taxable taxCode inventoryPolicy selectedOptions{name value}
    inventoryItem{id tracked requiresShipping sku inventoryLevels(first:5){nodes{id location{id}} pageInfo{hasNextPage}}} source:metafield(namespace:"tour",key:"source_variant"){value} servingCount:metafield(namespace:"custom",key:"serving_count"){value}}
    pageInfo{hasNextPage}}`;
function check(
  payload: { userErrors: Array<{ message: string }> },
  action: string,
) {
  if (payload.userErrors.length)
    throw new Error(
      `${action}: ${payload.userErrors.map((e) => e.message).join("; ")}`,
    );
}
async function assertTourBoardLocation(graphql: TourGraphql, locationId: string) {
  if (locationId === process.env.SHOPIFY_DELIVERY_LOCATION_ID?.trim())
    throw new Error(
      "SHOPIFY_TOUR_BOARD_LOCATION_ID must differ from the ordinary delivery location.",
    );
  const { location } = await graphql<{
    location: { id: string; isActive: boolean; fulfillsOnlineOrders: boolean } | null;
  }>(
    `query TourBoardFulfillmentLocation($id: ID!) {
      location(id: $id) { id isActive fulfillsOnlineOrders }
    }`,
    { id: locationId },
  );
  if (!location || location.id !== locationId || !location.isActive || !location.fulfillsOnlineOrders)
    throw new Error(
      "The dedicated on-tour fulfillment location must exist, be active, and fulfill online orders.",
    );
}
export function tourBoardPlan(
  product: SyncProduct,
  locationId = process.env.SHOPIFY_TOUR_BOARD_LOCATION_ID || "",
) {
  if (product.variants.pageInfo.hasNextPage)
    throw new Error(
      `${product.handle}: more than 100 variants require paginated provisioning.`,
    );
  const sources = product.variants.nodes.filter(
    (v) => !isTourVariant(v) && v.inventoryItem.requiresShipping,
  );
  const sourceIds = new Set(sources.map((v) => v.id));
  const optionKey = (variant: SyncVariant) =>
    JSON.stringify(
      variant.selectedOptions
        .filter((o) => o.name !== FULFILLMENT_OPTION)
        .map((o) => [o.name, o.value])
        .sort((a, b) => a[0].localeCompare(b[0])),
    );
  const inferred = new Set<string>();
  const targets = product.variants.nodes.filter(isTourVariant).map((target) => {
    if (target.source?.value && sourceIds.has(target.source.value))
      return target;
    const matches = sources.filter(
      (source) => optionKey(source) === optionKey(target),
    );
    if (matches.length === 1) {
      inferred.add(target.id);
      return { ...target, source: { value: matches[0].id } };
    }
    return target;
  });
  if (
    (sources.length || targets.length) &&
    !/^gid:\/\/shopify\/Location\/\d+$/.test(locationId)
  )
    throw new Error(
      "SHOPIFY_TOUR_BOARD_LOCATION_ID must identify the dedicated on-tour fulfillment location.",
    );
  if ([...sources, ...targets].some((v) => v.inventoryItem.tracked))
    throw new Error(
      `${product.handle}: tracked board inventory needs a shared-inventory design before on-tour variants can be enabled.`,
    );
  if (targets.some((v) => v.inventoryItem.inventoryLevels?.pageInfo?.hasNextPage))
    throw new Error(
      `${product.handle}: on-tour fulfillment locations require paginated reconciliation.`,
    );
  if (
    sources.length &&
    !product.options.some((o) => o.name === FULFILLMENT_OPTION) &&
    product.options.length >= 3
  )
    throw new Error(
      `${product.handle}: there is no free product option for tour fulfillment.`,
    );
  const bySource = new Map<string, SyncVariant>();
  for (const variant of targets) {
    if (!variant.source?.value)
      throw new Error(
        `${product.handle}: an On tour variant has no source reference.`,
      );
    if (bySource.has(variant.source.value))
      throw new Error(
        `${product.handle}: duplicate On tour source references.`,
      );
    bySource.set(variant.source.value, variant);
  }
  const missing = sources.filter((v) => !bySource.has(v.id));
  const changes = sources.flatMap((source) => {
    const target = bySource.get(source.id);
    if (!target) return [];
    return inferred.has(target.id) ||
      optionKey(target) !== optionKey(source) ||
      Number(target.price) !== Number(source.price) ||
      target.compareAtPrice !== source.compareAtPrice ||
      target.taxable !== source.taxable ||
      target.taxCode !== source.taxCode ||
      (source.servingCount?.value && target.servingCount?.value !== source.servingCount.value) ||
      target.inventoryPolicy !== "CONTINUE" ||
      !target.inventoryItem.requiresShipping ||
      target.inventoryItem.tracked
      ? [{ source, target }]
      : [];
  });
  const orphaned = targets.filter((v) => !sourceIds.has(v.source!.value));
  const activations = sources.flatMap((source) => {
    const target = bySource.get(source.id);
    const active = new Set(
      target?.inventoryItem.inventoryLevels?.nodes.map(
        (level) => level.location.id,
      ) || [],
    );
    return target && !active.has(locationId)
      ? [{ source, target, location: locationId }]
      : [];
  });
  const deactivations = sources.flatMap((source) => {
    const target = bySource.get(source.id);
    return (target?.inventoryItem.inventoryLevels?.nodes || [])
      .filter((level) => level.location.id !== locationId)
      .map((level) => {
        if (!level.id)
          throw new Error(`${product.handle}: on-tour inventory level ID is missing.`);
        return {
          source,
          target: target!,
          location: level.location.id,
          levelId: level.id,
        };
      });
  });
  return {
    sources,
    targets,
    missing,
    changes,
    orphaned,
    activations,
    deactivations,
  };
}
export async function loadSyncProduct(
  graphql: TourGraphql,
  id: string,
): Promise<SyncProduct | null> {
  return (
    await graphql<{ product: SyncProduct | null }>(
      `query TourBoardSyncProduct($id:ID!){product(id:$id){${fields}}}`,
      { id },
    )
  ).product;
}
function mirrored(source: SyncVariant) {
  return {
    optionValues: source.selectedOptions.map((o) => ({
      optionName: o.name,
      name: o.name === FULFILLMENT_OPTION ? TOUR_FULFILLMENT : o.value,
    })),
    price: source.price,
    compareAtPrice: source.compareAtPrice,
    taxable: source.taxable,
    taxCode: source.taxCode,
    inventoryPolicy: "CONTINUE",
    inventoryItem: { tracked: false, requiresShipping: true },
    metafields: [
      ...(source.servingCount?.value ? [{ namespace: 'custom', key: 'serving_count', type: 'single_line_text_field', value: source.servingCount.value }] : []),
      {
        namespace: "tour",
        key: "source_variant",
        type: "single_line_text_field",
        value: source.id,
      },
    ],
  };
}
export async function syncTourBoardProduct(
  graphql: TourGraphql,
  id: string,
  collectionHandle = "charcuterie",
  dryRun = false,
  locationId = process.env.SHOPIFY_TOUR_BOARD_LOCATION_ID || "",
) {
  let product = await loadSyncProduct(graphql, id);
  if (
    !product ||
    !product.collections.nodes.some((c) => c.handle === collectionHandle)
  )
    return { skipped: true };
  let plan = tourBoardPlan(product, locationId);
  if (plan.sources.length || plan.targets.length)
    await assertTourBoardLocation(graphql, locationId);
  if (dryRun)
    return {
      handle: product.handle,
      create: plan.missing.length,
      update: plan.changes.length,
      remove: plan.orphaned.length,
      activate: plan.activations.length,
      deactivate: plan.deactivations.length,
    };
  if (
    !plan.missing.length &&
    !plan.changes.length &&
    !plan.orphaned.length &&
    !plan.activations.length &&
    !plan.deactivations.length
  )
    return { handle: product.handle, changed: false };
  const token = randomUUID();
  if (product.lock && JSON.parse(product.lock.value).expiresAt > Date.now())
    return { handle: product.handle, busy: true };
  const setLock = async (p: SyncProduct, value: string) =>
    graphql<{
      metafieldsSet: { userErrors: Array<{ code?: string; message: string }> };
    }>(
      `
        mutation TourBoardSyncLock($input: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $input) {
            userErrors {
              code
              message
            }
          }
        }
      `,
      {
        input: [
          {
            ownerId: p.id,
            namespace: "tour",
            key: "variant_sync_lock",
            type: "json",
            value,
            compareDigest: p.lock?.compareDigest ?? null,
          },
        ],
      },
    );
  const lease = await setLock(
    product,
    JSON.stringify({ token, expiresAt: Date.now() + 180_000 }),
  );
  if (
    lease.metafieldsSet.userErrors.some((e) =>
      [
        "STALE_OBJECT",
        "COMPARE_DIGEST_MISMATCH",
        "INVALID_COMPARE_DIGEST",
      ].includes(e.code || ""),
    )
  )
    return { handle: product.handle, busy: true };
  check(lease.metafieldsSet, "Acquiring on-tour sync lease");
  try {
    // Re-read after taking the lease so retries and webhook bursts see the current variants.
    product = (await loadSyncProduct(graphql, id))!;
    plan = tourBoardPlan(product, locationId);
    if (
      plan.missing.length &&
      !product.options.some((o) => o.name === FULFILLMENT_OPTION)
    ) {
      const before = new Set(plan.sources.map((v) => v.id));
      const r = await graphql<{
        productOptionsCreate: { userErrors: Array<{ message: string }> };
      }>(
        `
          mutation TourBoardOption($id: ID!, $options: [OptionCreateInput!]!) {
            productOptionsCreate(
              productId: $id
              options: $options
              variantStrategy: LEAVE_AS_IS
            ) {
              userErrors {
                message
              }
            }
          }
        `,
        {
          id,
          options: [
            {
              name: FULFILLMENT_OPTION,
              values: [
                { name: DELIVERY_FULFILLMENT },
                { name: TOUR_FULFILLMENT },
              ],
            },
          ],
        },
      );
      check(r.productOptionsCreate, "Adding fulfillment option");
      product = (await loadSyncProduct(graphql, id))!;
      plan = tourBoardPlan(product, locationId);
      if (
        plan.sources.length !== before.size ||
        plan.sources.some((v) => !before.has(v.id))
      )
        throw new Error(
          "Shopify changed the original variant identities; provisioning stopped.",
        );
    }
    if (plan.missing.length) {
      const r = await graphql<{
        productVariantsBulkCreate: { userErrors: Array<{ message: string }> };
      }>(
        `
          mutation TourBoardVariants(
            $id: ID!
            $variants: [ProductVariantsBulkInput!]!
          ) {
            productVariantsBulkCreate(
              productId: $id
              variants: $variants
              strategy: DEFAULT
            ) {
              userErrors {
                message
              }
            }
          }
        `,
        {
          id,
          variants: plan.missing.map((source) => ({
            ...mirrored(source),
            optionValues: source.selectedOptions.map((o) => ({
              optionName: o.name,
              name: o.name === FULFILLMENT_OPTION ? TOUR_FULFILLMENT : o.value,
            })),
            metafields: mirrored(source).metafields,
          })),
        },
      );
      check(r.productVariantsBulkCreate, "Creating on-tour variants");
    }
    if (plan.changes.length) {
      const r = await graphql<{
        productVariantsBulkUpdate: { userErrors: Array<{ message: string }> };
      }>(
        `
          mutation UpdateTourBoardVariants(
            $id: ID!
            $variants: [ProductVariantsBulkInput!]!
          ) {
            productVariantsBulkUpdate(productId: $id, variants: $variants) {
              userErrors {
                message
              }
            }
          }
        `,
        {
          id,
          variants: plan.changes.map(({ source, target }) => ({
            id: target.id,
            ...mirrored(source),
          })),
        },
      );
      check(r.productVariantsBulkUpdate, "Updating on-tour variants");
    }
    if (plan.orphaned.length) {
      const r = await graphql<{
        productVariantsBulkDelete: { userErrors: Array<{ message: string }> };
      }>(
        `
          mutation RemoveOrphanTourVariants($id: ID!, $variants: [ID!]!) {
            productVariantsBulkDelete(productId: $id, variantsIds: $variants) {
              userErrors {
                message
              }
            }
          }
        `,
        { id, variants: plan.orphaned.map((v) => v.id) },
      );
      check(r.productVariantsBulkDelete, "Removing orphan on-tour variants");
    }
    product = (await loadSyncProduct(graphql, id))!;
    const locations = tourBoardPlan(product, locationId);
    await reconcileTourLocations(graphql, locations);
    product = (await loadSyncProduct(graphql, id))!;
    const remaining = tourBoardPlan(product, locationId);
    if (
      remaining.missing.length ||
      remaining.changes.length ||
      remaining.orphaned.length ||
      remaining.activations.length ||
      remaining.deactivations.length
    )
      throw new Error(`${product.handle}: on-tour fulfillment reconciliation is incomplete.`);
    return { handle: product.handle, changed: true };
  } finally {
    const current = await loadSyncProduct(graphql, id);
    if (current?.lock && JSON.parse(current.lock.value).token === token) {
      const r = await setLock(current, JSON.stringify({ token, expiresAt: 0 }));
      check(r.metafieldsSet, "Releasing on-tour sync lease");
    }
  }
}
async function reconcileTourLocations(
  graphql: TourGraphql,
  plan: ReturnType<typeof tourBoardPlan>,
) {
  // Establish the dedicated origin before removing any previous on-tour origin.
  // Regular Delivery variants and inventory quantities are never changed here.
  for (const { target, location } of plan.activations) {
    if (!target.inventoryItem.id)
      throw new Error("Tour board inventory item is missing.");
    const r = await graphql<{
      inventoryActivate: { userErrors: Array<{ message: string }> };
    }>(
      `
        mutation ActivateTourBoard($item: ID!, $location: ID!, $key: String!) {
          inventoryActivate(inventoryItemId: $item, locationId: $location) @idempotent(key: $key) {
            userErrors {
              message
            }
          }
        }
      `,
      { item: target.inventoryItem.id, location, key: randomUUID() },
    );
    check(r.inventoryActivate, "Activating tour board fulfillment location");
  }
  for (const { levelId } of plan.deactivations) {
    const r = await graphql<{
      inventoryDeactivate: { userErrors: Array<{ message: string }> };
    }>(
      `mutation DeactivateTourBoard($level: ID!) {
        inventoryDeactivate(inventoryLevelId: $level) { userErrors { message } }
      }`,
      { level: levelId },
    );
    check(
      r.inventoryDeactivate,
      "Removing previous tour board fulfillment location",
    );
  }
}
export async function syncTourBoards(
  graphql: TourGraphql,
  collectionHandle = "charcuterie",
  dryRun = false,
  maxMs = Infinity,
  locationId = process.env.SHOPIFY_TOUR_BOARD_LOCATION_ID || "",
) {
  const started = Date.now();
  const ids: string[] = [];
  let after: string | null = null;
  do {
    const data: {
      collectionByHandle: {
        products: {
          nodes: Array<{ id: string }>;
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      } | null;
    } = await graphql(
      `
        query TourBoardCollection($handle: String!, $after: String) {
          collectionByHandle(handle: $handle) {
            products(first: 100, after: $after) {
              nodes {
                id
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `,
      { handle: collectionHandle, after },
    );
    if (!data.collectionByHandle)
      throw new Error("Charcuterie collection was not found.");
    ids.push(...data.collectionByHandle.products.nodes.map((p) => p.id));
    after = data.collectionByHandle.products.pageInfo.hasNextPage
      ? data.collectionByHandle.products.pageInfo.endCursor
      : null;
  } while (after);
  const results = [];
  for (const id of ids) {
    if (Date.now() - started > maxMs) {
      results.push({ pending: ids.length - results.length });
      break;
    }
    results.push(
      await syncTourBoardProduct(graphql, id, collectionHandle, dryRun, locationId),
    );
  }
  return results;
}
export async function resolveTourBoard(
  graphql: TourGraphql,
  productId: string,
  sourceId: string,
  collectionHandle = "charcuterie",
  locationId = process.env.SHOPIFY_TOUR_BOARD_LOCATION_ID || "",
) {
  const fulfillmentError = "Tour board fulfillment is not yet configured. Please choose another snack or contact us.";
  // Public checkout should not expose internal configuration names. Maintenance retains its diagnostic.
  if (!/^gid:\/\/shopify\/Location\/\d+$/.test(locationId)) throw new Error(fulfillmentError);
  try {
    await assertTourBoardLocation(graphql, locationId);
  } catch {
    throw new Error(fulfillmentError);
  }
  let product = await loadSyncProduct(graphql, productId);
  if (
    !product ||
    !product.collections.nodes.some((c) => c.handle === collectionHandle)
  )
    throw new Error("That board is not in the charcuterie catalog.");
  let plan = tourBoardPlan(product, locationId);
  const source = plan.sources.find((v) => v.id === sourceId);
  if (!source)
    throw new Error("Choose a delivery variant from the regular catalog.");
  let target = plan.targets.find((v) => v.source?.value === sourceId);
  if (!target)
    throw new Error(
      "Tour fulfillment is not yet enabled for this board. Please choose another board or snack.",
    );
  if (
    !target.inventoryItem.requiresShipping ||
    target.inventoryPolicy !== "CONTINUE" ||
    plan.activations.some((a) => a.source.id === sourceId) ||
    plan.deactivations.some((a) => a.source.id === sourceId)
  )
    throw new Error(fulfillmentError);
  // Existing counterparts can be repriced safely at checkout; provisioning is a deliberate setup step.
  if (plan.changes.some((change) => change.source.id === sourceId)) {
    const r = await graphql<{
      productVariantsBulkUpdate: { userErrors: Array<{ message: string }> };
    }>(
      `
        mutation TourBoardCheckoutPrice(
          $id: ID!
          $variants: [ProductVariantsBulkInput!]!
        ) {
          productVariantsBulkUpdate(productId: $id, variants: $variants) {
            userErrors {
              message
            }
          }
        }
      `,
      { id: product.id, variants: [{ id: target.id, ...mirrored(source) }] },
    );
    check(r.productVariantsBulkUpdate, "Matching the current catalog price");
    product = (await loadSyncProduct(graphql, productId))!;
    plan = tourBoardPlan(product, locationId);
    target = plan.targets.find((v) => v.source?.value === sourceId);
  }
  const currentSource = plan.sources.find((v) => v.id === sourceId);
  if (
    !target ||
    !currentSource ||
    !target.inventoryItem.requiresShipping ||
    target.inventoryItem.tracked ||
    target.inventoryPolicy !== "CONTINUE" ||
    Number(target.price) !== Number(currentSource.price) ||
    plan.activations.some((a) => a.source.id === sourceId) ||
    plan.deactivations.some((a) => a.source.id === sourceId) ||
    plan.changes.some((change) => change.source.id === sourceId)
  )
    throw new Error(
      "The board price changed. Refresh your selection before checkout.",
    );
  return { id: target.id, price: currentSource.price };
}
