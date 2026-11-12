import test from "node:test";
import assert from "node:assert/strict";
import {
  tourBoardPlan,
  syncTourBoardProduct,
} from "../src/lib/shopify/tour-board-sync.ts";
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
  inventoryItem: { tracked: false, requiresShipping: true, sku: null },
  source: null,
};
const target = {
  ...source,
  id: "target",
  selectedOptions: [
    { name: "Size", value: "Small" },
    { name: "Fulfillment", value: "On tour" },
  ],
  inventoryItem: { tracked: false, requiresShipping: false, sku: null },
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
    () => tourBoardPlan(product([{ ...target, source: null }])),
    /no source reference/,
  );
});
test("a product already in sync performs no writes, so its own product webhook cannot loop", async () => {
  let writes = 0;
  const graphql = async (query) => {
    if (query.startsWith("mutation")) writes++;
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
    if (query.startsWith("mutation")) writes++;
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
  let updated;
  const graphql = async (query, v) => {
    if (query.startsWith("query")) return { product: structuredClone(data) };
    if (query.includes("mutation TourBoardSyncLock")) {
      data.lock = { value: v.input[0].value, compareDigest: "digest" };
      return { metafieldsSet: { userErrors: [] } };
    }
    if (query.includes("mutation UpdateTourBoardVariants")) {
      updated = v.variants;
      return { productVariantsBulkUpdate: { userErrors: [] } };
    }
    throw new Error("Unexpected operation");
  };
  await syncTourBoardProduct(graphql, "board");
  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, "target");
  assert.equal(updated[0].price, "59.00");
  assert.equal(updated[0].taxable, true);
  assert.equal(updated[0].inventoryItem.requiresShipping, false);
});
test("on-tour variants activate the same fulfillment location without copying inventory quantities", async () => {
  const data = product();
  data.variants.nodes[0].inventoryItem.id = "source-item";
  data.variants.nodes[0].inventoryItem.inventoryLevels = {
    nodes: [{ location: { id: "location" } }],
  };
  data.variants.nodes[1].inventoryItem.id = "target-item";
  data.variants.nodes[1].inventoryItem.inventoryLevels = { nodes: [] };
  assert.equal(tourBoardPlan(data).activations.length, 1);
  let activations = 0;
  const graphql = async (query, v) => {
    if (query.startsWith("query")) return { product: structuredClone(data) };
    if (query.includes("mutation TourBoardSyncLock")) {
      data.lock = { value: v.input[0].value, compareDigest: "digest" };
      return { metafieldsSet: { userErrors: [] } };
    }
    if (query.includes("mutation ActivateTourBoard")) {
      assert.deepEqual(v, { item: "target-item", location: "location" });
      activations++;
      data.variants.nodes[1].inventoryItem.inventoryLevels.nodes.push({
        location: { id: "location" },
      });
      return { inventoryActivate: { userErrors: [] } };
    }
    throw new Error("Unexpected operation");
  };
  await syncTourBoardProduct(graphql, "board");
  assert.equal(activations, 1);
  assert.equal((await syncTourBoardProduct(graphql, "board")).changed, false);
});

test("Shopify-generated option combinations can be paired to their matching regular variant", () => {
  const plan = tourBoardPlan(product([source, { ...target, source: null }]));
  assert.equal(plan.missing.length, 0);
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].target.source.value, source.id);
});
