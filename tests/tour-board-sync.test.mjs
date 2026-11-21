import test from "node:test";
import assert from "node:assert/strict";
import {
  tourBoardPlan as buildPlan,
  syncTourBoardProduct as syncProduct,
  resolveTourBoard as resolveBoard,
} from "../src/lib/shopify/tour-board-sync.ts";
const locationId = "gid://shopify/Location/200";
const deliveryLocationId = "gid://shopify/Location/100";
const tourBoardPlan = (product) => buildPlan(product, locationId);
const withValidLocation = (graphql) => async (query, variables) =>
  query.includes("query TourBoardFulfillmentLocation")
    ? { location: { id: variables.id, isActive: true, fulfillsOnlineOrders: true } }
    : graphql(query, variables);
const syncTourBoardProduct = (graphql, id, handle = "charcuterie", dryRun = false) =>
  syncProduct(withValidLocation(graphql), id, handle, dryRun, locationId);
const resolveTourBoard = (graphql, ...args) => resolveBoard(withValidLocation(graphql), ...args);
const source = {
  id: "source",
  price: "59.00",
  inventoryPolicy: "CONTINUE",
  compareAtPrice: null,
  taxable: true,
  taxCode: null,
  selectedOptions: [
    { name: "Size", value: "Small" },
    { name: "Fulfillment", value: "Delivery" },
  ],
  inventoryItem: {
    id: "source-item", tracked: false, requiresShipping: true, sku: null,
    inventoryLevels: { nodes: [{ id: "source-level", location: { id: deliveryLocationId } }], pageInfo: { hasNextPage: false } },
  },
  source: null,
};
const target = {
  ...source,
  id: "target",
  selectedOptions: [
    { name: "Size", value: "Small" },
    { name: "Fulfillment", value: "On tour" },
  ],
  inventoryItem: {
    id: "target-item", tracked: false, requiresShipping: true, sku: null,
    inventoryLevels: { nodes: [{ id: "target-level", location: { id: locationId } }], pageInfo: { hasNextPage: false } },
  },
  source: { value: "source" },
};
function product(variants = [source, target]) {
  return {
    id: "board",
    handle: "board",
    options: [
      { id: "size", name: "Size" },
      { id: "fulfillment", name: "Fulfillment" },
    ],
    collections: { nodes: [{ handle: "charcuterie" }] },
    variants: {
      nodes: structuredClone(variants),
      pageInfo: { hasNextPage: false },
    },
    lock: null,
  };
}
test("identifies missing and changed counterparts, and orphaned references", () => {
  assert.equal(tourBoardPlan(product([source])).missing.length, 1);
  assert.equal(tourBoardPlan(product()).changes.length, 0);
  assert.equal(
    tourBoardPlan(product([source, { ...target, price: "1.00" }])).changes
      .length,
    1,
  );
  assert.equal(tourBoardPlan(product([target])).orphaned.length, 1);
});
test("physical on-tour counterparts remain targets and never become catalog sources", () => {
  const plan = tourBoardPlan(product());
  assert.deepEqual(plan.sources.map((v) => v.id), ["source"]);
  assert.deepEqual(plan.targets.map((v) => v.id), ["target"]);
  assert.equal(plan.missing.length, 0);
});
test("missing dedicated location and incomplete inventory pagination fail before writes", async () => {
  assert.throws(() => buildPlan(product(), ""), /SHOPIFY_TOUR_BOARD_LOCATION_ID/);
  assert.throws(() => buildPlan(product(), "location"), /SHOPIFY_TOUR_BOARD_LOCATION_ID/);
  const data = product();
  data.variants.nodes[1].inventoryItem.inventoryLevels.pageInfo.hasNextPage = true;
  assert.throws(() => tourBoardPlan(data), /paginated/);
  let writes = 0;
  await assert.rejects(() => syncProduct(async (query) => {
    if (query.trimStart().startsWith("mutation")) writes++;
    return { product: product() };
  }, "board", "charcuterie", false, ""), /SHOPIFY_TOUR_BOARD_LOCATION_ID/);
  assert.equal(writes, 0);
});
test("nonexistent, inactive and non-fulfilling dedicated origins fail before sync or checkout writes", async () => {
  const cases = [
    null,
    { id: locationId, isActive: false, fulfillsOnlineOrders: true },
    { id: locationId, isActive: true, fulfillsOnlineOrders: false },
  ];
  for (const location of cases) {
    let writes = 0;
    const data = product([source, { ...target, price: "1.00", inventoryItem: { ...target.inventoryItem, requiresShipping: false } }]);
    const graphql = async (query) => {
      if (query.includes("query TourBoardFulfillmentLocation")) return { location };
      if (query.trimStart().startsWith("mutation")) writes++;
      return { product: data };
    };
    await assert.rejects(() => syncProduct(graphql, "board", "charcuterie", false, locationId), /must exist, be active/);
    await assert.rejects(() => resolveBoard(graphql, "board", "source", "charcuterie", locationId), /fulfillment is not yet configured/);
    assert.equal(writes, 0);
  }
});
test("the ordinary local-delivery origin cannot be configured for on-tour fulfillment", async () => {
  const previous = process.env.SHOPIFY_DELIVERY_LOCATION_ID;
  process.env.SHOPIFY_DELIVERY_LOCATION_ID = locationId;
  try {
    let writes = 0;
    const graphql = async (query) => {
      if (query.trimStart().startsWith("mutation")) writes++;
      return { product: product() };
    };
    await assert.rejects(() => syncProduct(graphql, "board", "charcuterie", false, locationId), /must differ from the ordinary/);
    await assert.rejects(() => resolveBoard(graphql, "board", "source", "charcuterie", locationId), /fulfillment is not yet configured/);
    assert.equal(writes, 0);
  } finally {
    if (previous === undefined) delete process.env.SHOPIFY_DELIVERY_LOCATION_ID;
    else process.env.SHOPIFY_DELIVERY_LOCATION_ID = previous;
  }
});

test('public checkout hides configuration diagnostics and makes no Shopify request when location is invalid', async () => {
  for (const location of ['', 'not-a-location']) {
    let requests = 0;
    await assert.rejects(resolveTourBoard(async () => { requests++; throw new Error('Unexpected Shopify request'); },
      'board', 'source', 'charcuterie', location), error => {
      assert.equal(error.message, 'Tour board fulfillment is not yet configured. Please choose another snack or contact us.');
      assert.ok(!error.message.includes('SHOPIFY_'));
      return true;
    });
    assert.equal(requests, 0);
  }
  assert.throws(() => buildPlan(product(), ''), /SHOPIFY_TOUR_BOARD_LOCATION_ID/,
    'Maintenance must retain the actionable configuration diagnostic');
});

test('serving fields on source variants are reconciled onto on-tour counterparts', () => {
  const withCount = { ...source, servingCount: { value: '4' } };
  assert.equal(tourBoardPlan(product([withCount, target])).changes.length, 1);
  assert.equal(tourBoardPlan(product([withCount, { ...target, servingCount: { value: '4' } }])).changes.length, 0);
});
test("refuses duplicate mappings and tracked board inventory instead of duplicating stock", () => {
  assert.throws(
    () => tourBoardPlan(product([source, target, { ...target, id: "other" }])),
    /duplicate/,
  );
  assert.throws(
    () =>
      tourBoardPlan(
        product([
          {
            ...source,
            inventoryItem: { ...source.inventoryItem, tracked: true },
          },
        ]),
      ),
    /shared-inventory design/,
  );
  assert.throws(
    () => tourBoardPlan(product([source, { ...target, inventoryItem: { ...target.inventoryItem, tracked: true } }])),
    /shared-inventory design/,
  );
  assert.throws(
    () => tourBoardPlan(product([{ ...target, source: null }])),
    /no source reference/,
  );
});
test("a product already in sync performs no writes, so its own product webhook cannot loop", async () => {
  let writes = 0;
  const graphql = async (query) => {
    if (query.trimStart().startsWith("mutation")) writes++;
    return { product: product() };
  };
  const result = await syncTourBoardProduct(graphql, "board");
  assert.equal(result.changed, false);
  assert.equal(writes, 0);
});
test("dry run reports changes without altering products, and non-collection products are skipped", async () => {
  let writes = 0;
  let data = product([source]);
  const graphql = async (query) => {
    if (query.trimStart().startsWith("mutation")) writes++;
    return { product: data };
  };
  const report = await syncTourBoardProduct(
    graphql,
    "board",
    "charcuterie",
    true,
  );
  assert.equal(report.create, 1);
  assert.equal(writes, 0);
  data.collections.nodes = [];
  assert.equal((await syncTourBoardProduct(graphql, "board")).skipped, true);
});
test("price and tax changes update the counterpart, never the regular variant", async () => {
  const data = product([source, { ...target, price: "20.00", taxable: false }]);
  data.variants.nodes[0].inventoryPolicy = "DENY";
  const original = structuredClone(data.variants.nodes[0]);
  let updated;
  const graphql = async (query, v) => {
    if (query.startsWith("query")) return { product: structuredClone(data) };
    if (query.includes("mutation TourBoardSyncLock")) {
      data.lock = { value: v.input[0].value, compareDigest: "digest" };
      return { metafieldsSet: { userErrors: [] } };
    }
    if (query.includes("mutation UpdateTourBoardVariants")) {
      updated = v.variants;
      Object.assign(data.variants.nodes[1], updated[0], {
        inventoryItem: { ...data.variants.nodes[1].inventoryItem, ...updated[0].inventoryItem },
      });
      return { productVariantsBulkUpdate: { userErrors: [] } };
    }
    throw new Error("Unexpected operation");
  };
  await syncTourBoardProduct(graphql, "board");
  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, "target");
  assert.equal(updated[0].price, "59.00");
  assert.equal(updated[0].taxable, true);
  assert.equal(updated[0].inventoryItem.requiresShipping, true);
  assert.equal(updated[0].inventoryItem.tracked, false);
  assert.equal(updated[0].inventoryPolicy, "CONTINUE");
  assert.deepEqual(data.variants.nodes[0], original);
});
test("on-tour variants move only their own stock to the dedicated location without copying quantities", async () => {
  const data = product();
  const original = structuredClone(data.variants.nodes[0]);
  data.variants.nodes[1].inventoryItem.inventoryLevels.nodes = [{ id: "old-tour-level", location: { id: deliveryLocationId } }];
  assert.equal(tourBoardPlan(data).activations.length, 1);
  assert.equal(tourBoardPlan(data).deactivations.length, 1);
  const writes = [];
  const graphql = async (query, v) => {
    if (query.startsWith("query")) return { product: structuredClone(data) };
    if (query.includes("mutation TourBoardSyncLock")) {
      data.lock = { value: v.input[0].value, compareDigest: "digest" };
      return { metafieldsSet: { userErrors: [] } };
    }
    if (query.includes("mutation ActivateTourBoard")) {
      assert.equal(v.item, "target-item");
      assert.equal(v.location, locationId);
      assert.match(v.key, /^[\da-f-]{36}$/);
      assert.match(query, /@idempotent/);
      assert.equal("available" in v, false);
      assert.equal("onHand" in v, false);
      writes.push("activate");
      data.variants.nodes[1].inventoryItem.inventoryLevels.nodes.push({
        id: "target-level", location: { id: locationId },
      });
      return { inventoryActivate: { userErrors: [] } };
    }
    if (query.includes("mutation DeactivateTourBoard")) {
      assert.deepEqual(v, { level: "old-tour-level" });
      writes.push("deactivate");
      data.variants.nodes[1].inventoryItem.inventoryLevels.nodes = data.variants.nodes[1].inventoryItem.inventoryLevels.nodes.filter((level) => level.id !== v.level);
      return { inventoryDeactivate: { userErrors: [] } };
    }
    throw new Error("Unexpected operation");
  };
  await syncTourBoardProduct(graphql, "board");
  assert.deepEqual(writes, ["activate", "deactivate"]);
  assert.deepEqual(data.variants.nodes[0], original);
  assert.deepEqual(data.variants.nodes[1].inventoryItem.inventoryLevels.nodes.map((level) => level.location.id), [locationId]);
  assert.equal((await syncTourBoardProduct(graphql, "board")).changed, false);
});
test("a failed dedicated-location activation leaves the previous inventory level intact", async () => {
  const data = product();
  data.variants.nodes[1].inventoryItem.inventoryLevels.nodes = [{ id: "old-tour-level", location: { id: deliveryLocationId } }];
  const original = structuredClone(data.variants.nodes);
  const operations = [];
  const graphql = async (query, variables) => {
    if (query.startsWith("query")) return { product: structuredClone(data) };
    if (query.includes("mutation TourBoardSyncLock")) {
      data.lock = { value: variables.input[0].value, compareDigest: "digest" };
      return { metafieldsSet: { userErrors: [] } };
    }
    if (query.includes("mutation ActivateTourBoard")) {
      operations.push("activate");
      return { inventoryActivate: { userErrors: [{ message: "Location cannot fulfill orders." }] } };
    }
    if (query.includes("mutation DeactivateTourBoard")) operations.push("deactivate");
    throw new Error("Unexpected operation");
  };
  await assert.rejects(() => syncTourBoardProduct(graphql, "board"), /Location cannot fulfill/);
  assert.deepEqual(operations, ["activate"]);
  assert.deepEqual(data.variants.nodes, original);
});
test("checkout refuses stock at a paid delivery origin without mutating inventory", async () => {
  const data = product();
  data.variants.nodes[1].inventoryItem.inventoryLevels.nodes.push({ id: "old-tour-level", location: { id: deliveryLocationId } });
  let writes = 0;
  await assert.rejects(() => resolveTourBoard(async (query) => {
    if (query.trimStart().startsWith("mutation")) writes++;
    return { product: data };
  }, "board", "source", "charcuterie", locationId), /fulfillment is not yet configured/);
  assert.equal(writes, 0);
});
test("checkout refuses legacy nonphysical counterparts without migrating them", async () => {
  const data = product();
  data.variants.nodes[1].inventoryItem.requiresShipping = false;
  let writes = 0;
  await assert.rejects(() => resolveTourBoard(async (query) => {
    if (query.trimStart().startsWith("mutation")) writes++;
    return { product: data };
  }, "board", "source", "charcuterie", locationId), /fulfillment is not yet configured/);
  assert.equal(writes, 0);
});

test("Shopify-generated option combinations can be paired to their matching regular variant", () => {
  const plan = tourBoardPlan(product([source, { ...target, source: null }]));
  assert.equal(plan.missing.length, 0);
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].target.source.value, source.id);
});
