import test from "node:test";
import assert from "node:assert/strict";
import {
  validateTourRegistration,
  tourBookingAttributes,
} from "../src/lib/tour-booking.ts";
import {
  isTourVariant,
  deliveryVariantTitle,
} from "../src/lib/tour-fulfillment.ts";
import { tourBookingService } from "../src/lib/shopify/tour-booking.ts";
const base = {
  tourType: "public",
  guests: 2,
  snack: "none",
  date: "2026-11-14",
  name: "Test Guest",
  email: "guest@example.com",
  phone: "2025550199",
  pickup: "Arrange by phone",
  preferences: [],
  ageConfirmed: true,
  termsAccepted: true,
  damageAccepted: true,
};
const sourceId = "gid://shopify/ProductVariant/123";
const tourId = "gid://shopify/ProductVariant/124";
function fixture() {
  const state = {
    fields: {
      enabled: "true",
      minimum_days: "3",
      months_ahead: "6",
      operating_days: JSON.stringify([
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ]),
      blackout_dates: "",
      seat_price: "125.00",
      bus_price: "1250.00",
    },
    remaining: 10,
    cartInput: null,
    cartWarning: false,
    dropBoard: false,
    wrongPrice: false,
    shippingBoard: false,
  };
  const makeVariant = (id, amount, requiresShipping = false) => ({
    id,
    title: "Default Title",
    availableForSale: true,
    quantityAvailable: null,
    requiresShipping,
    price: { amount, currencyCode: "USD" },
    selectedOptions: [{ name: "Title", value: "Default Title" }],
  });
  const source = {
    ...makeVariant(sourceId, "59.00", true),
    quantityAvailable: 0,
    selectedOptions: [{name: "Fulfillment", value: "Delivery"}],
  };
  const sources = [
    {
      id: sourceId,
      price: "59.00",
      inventoryPolicy: "CONTINUE",
      compareAtPrice: null,
      taxable: true,
      taxCode: null,
      selectedOptions: source.selectedOptions,
      inventoryItem: { tracked: false, requiresShipping: true, sku: null },
      source: null,
    },
    {
      id: tourId,
      price: "59.00",
      inventoryPolicy: "CONTINUE",
      compareAtPrice: null,
      taxable: true,
      taxCode: null,
      selectedOptions: [{ name: "Fulfillment", value: "On tour" }],
      inventoryItem: { tracked: false, requiresShipping: false, sku: null },
      source: { value: sourceId },
    },
  ];
  const syncProduct = {
    id: "board",
    handle: "regular-board",
    options: [{ id: "fulfillment", name: "Fulfillment" }],
    collections: { nodes: [{ handle: "charcuterie" }] },
    variants: { nodes: sources, pageInfo: { hasNextPage: false } },
    lock: null,
  };
  const product = {
    id: "board",
    handle: "regular-board",
    title: "Regular Board",
    tags: ["charcuterie"],
    featuredImage: null,
    variants: { nodes: [source] },
  };
  const departure = (handle) => ({
    id: handle,
    handle,
    tags: ["scheduled-tour"],
    variants: {
      nodes: [
        {
          ...makeVariant(
            handle,
            handle.startsWith("tour-bus") ? "1250.00" : "125.00",
          ),
          quantityAvailable: handle.startsWith("tour-bus")
            ? state.remaining === 10
              ? 1
              : 0
            : state.remaining,
        },
      ],
    },
  });
  const admin = async (query) => {
    if (query.includes("query BookingSchedule"))
      return {
        metaobjectByHandle: {
          fields: Object.entries(state.fields).map(([key, value]) => ({
            key,
            value,
          })),
        },
      };
    if (query.includes("query TourBoardSyncProduct"))
      return { product: syncProduct };
    throw new Error("Unexpected admin operation");
  };
  const storefront = async (query, v) => {
    if (query.includes("query TourCatalogBoards"))
      return {
        collection: {
          products: {
            nodes: [product],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      };
    if (query.includes("query BookingTours"))
      return {
        products: {
          nodes: [
            departure(
              v.query.includes("tour-bus")
                ? "tour-bus-2026-11-14"
                : "tour-seat-2026-11-14",
            ),
            departure("tour-seat-2026-11-12"),
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      };
    if (query.includes("query BookingDeparture"))
      return { product: departure(v.handle) };
    if (query.includes("mutation CreateTourBooking")) {
      state.cartInput = v.input;
      const nodes = v.input.lines
        .filter((_, i) => !state.dropBoard || i === 0)
        .map((line) => ({
          quantity: line.quantity,
          merchandise: {
            id: line.merchandiseId,
            requiresShipping:
              state.shippingBoard && line.merchandiseId === tourId,
            price: {
              amount: state.wrongPrice
                ? "0.01"
                : line.merchandiseId === tourId
                  ? "59.00"
                  : line.merchandiseId.startsWith("tour-bus")
                    ? "1250.00"
                    : "125.00",
              currencyCode: "USD",
            },
          },
        }));
      return {
        cartCreate: {
          cart: {
            checkoutUrl: "https://example.myshopify.com/checkouts/test",
            lines: { nodes },
            attributes: v.input.attributes,
            cost: { totalAmount: { amount: "250.00", currencyCode: "USD" } },
          },
          userErrors: [],
          warnings: state.cartWarning ? [{ message: "Quantity adjusted" }] : [],
        },
      };
    }
    throw new Error("Unexpected storefront operation");
  };
  return {
    state,
    syncProduct,
    product,
    service: tourBookingService({
      admin,
      storefront,
      now: () => new Date("2026-11-11T20:00:00Z"),
    }),
  };
}
test("registration requires contact information, legal acknowledgments and valid conditional fields", () => {
  assert.equal(validateTourRegistration(base).guests, 2);
  for (const change of [
    { guests: 11 },
    { date: "2026-02-30" },
    { email: "bad" },
    { phone: "123" },
    { ageConfirmed: "true" },
    { termsAccepted: false },
    { damageAccepted: false },
    { tourType: "custom" },
    { pickup: "Custom pickup (private tours)" },
    { snack: "sandwich", sandwich: "" },
    { snack: "charcuterie", boardVariantId: sourceId, boardQuantity: 0 },
  ])
    assert.throws(() => validateTourRegistration({ ...base, ...change }));
  assert.throws(
    () =>
      validateTourRegistration({
        ...base,
        tourType: "private",
        pickup: "Custom pickup (private tours)",
      }),
    /pickup address/,
  );
  assert.equal(
    validateTourRegistration({
      ...base,
      tourType: "private",
      pickup: "Custom pickup (private tours)",
      customPickup: "123 Test Street",
    }).customPickup,
    "123 Test Street",
  );
});
test("registration metadata records the actual private guest count and server acknowledgment time", () => {
  const attributes = tourBookingAttributes(
    validateTourRegistration({ ...base, tourType: "private", guests: 4 }),
    new Date("2026-11-11T20:00:00Z"),
    "reference",
  );
  assert.equal(attributes.find((a) => a.key === "Guest count").value, "4");
  assert.equal(
    attributes.find((a) => a.key === "Acknowledged at").value,
    "2026-11-11T20:00:00.000Z",
  );
});
test("normal storefront identifies and hides only the On tour fulfillment variants", () => {
  assert.equal(
    isTourVariant({
      selectedOptions: [{ name: "Fulfillment", value: "On tour" }],
    }),
    true,
  );
  assert.equal(
    isTourVariant({
      selectedOptions: [{ name: "Fulfillment", value: "Delivery" }],
    }),
    false,
  );
  assert.equal(
    deliveryVariantTitle({
      title: "Small / Delivery",
      selectedOptions: [
        { name: "Size", value: "Small" },
        { name: "Fulfillment", value: "Delivery" },
      ],
    }),
    "Small",
  );
});
test("availability applies the schedule immediately and checks the requested public party size", async () => {
  const { state, service } = fixture();
  state.remaining = 1;
  const data = await service.availability("public", 2);
  assert.equal(data.dates.length, 1);
  assert.equal(data.dates[0].available, false);
  assert.equal(data.addons[0].variants[0].price.amount, "59.00");
  state.fields.blackout_dates = "2026-11-14";
  assert.equal((await service.availability("public", 1)).dates.length, 0);
});
test("disabled and outside-horizon dates cannot reach Shopify cart creation", async () => {
  const { state, service } = fixture();
  state.fields.enabled = "false";
  await assert.rejects(service.checkout(base), /date is no longer available/);
  assert.equal(state.cartInput, null);
  state.fields.enabled = "true";
  for (const date of ["2026-11-13", "2027-05-12"])
    await assert.rejects(
      service.checkout({ ...base, date }),
      /date is no longer available/,
    );
});
test("public seats use party quantity and a private booking uses one bus with actual passenger metadata", async () => {
  const { state, service } = fixture();
  await service.checkout(base);
  assert.equal(state.cartInput.lines[0].quantity, 2);
  await service.checkout({ ...base, tourType: "private", guests: 4 });
  assert.equal(state.cartInput.lines[0].quantity, 1);
  assert.equal(
    state.cartInput.attributes.find((a) => a.key === "Guest count").value,
    "4",
  );
  assert.ok(
    !state.cartInput.lines[0].attributes.some((a) => a.key === "Mobile phone"),
  );
});
test("a private booking is rejected once any public seat has been sold", async () => {
  const { state, service } = fixture();
  state.remaining = 9;
  await assert.rejects(
    service.checkout({ ...base, tourType: "private" }),
    /whole bus is no longer available/,
  );
  assert.equal(state.cartInput, null);
});
test("catalog boards resolve to non-shipping counterparts at the normal price with no pickup preference", async () => {
  const { state, service } = fixture();
  await service.checkout({
    ...base,
    snack: "charcuterie",
    boardVariantId: sourceId,
    boardQuantity: 2,
  });
  assert.equal(state.cartInput.lines[1].merchandiseId, tourId);
  assert.equal(state.cartInput.lines[1].quantity, 2);
  assert.equal(state.cartInput.buyerIdentity.preferences, undefined);
  assert.ok(
    state.cartInput.lines[1].attributes.some(
      (a) => a.key === "Tour food fulfillment",
    ),
  );
});
test("forged or direct On tour variant IDs cannot bypass catalog board selection", async () => {
  const { state, service } = fixture();
  for (const boardVariantId of [tourId, "gid://shopify/ProductVariant/999"])
    await assert.rejects(
      service.checkout({
        ...base,
        snack: "charcuterie",
        boardVariantId,
        boardQuantity: 1,
      }),
      /catalog board is no longer available/,
    );
  assert.equal(state.cartInput, null);
});
test("build-your-own boards enforce the same ingredient rules as normal ordering", async () => {
  const { product, syncProduct, service } = fixture();
  product.handle = "build-your-own-board-small";
  syncProduct.handle = product.handle;
  await assert.rejects(
    service.checkout({
      ...base,
      snack: "charcuterie",
      boardVariantId: sourceId,
      boardQuantity: 1,
    }),
    /Choose ingredients/,
  );
});
test("warnings, lost lines, changed prices and shipping board lines all block handoff", async () => {
  for (const mode of [
    "cartWarning",
    "dropBoard",
    "wrongPrice",
    "shippingBoard",
  ]) {
    const { state, service } = fixture();
    state[mode] = true;
    await assert.rejects(
      service.checkout({
        ...base,
        snack: "charcuterie",
        boardVariantId: sourceId,
        boardQuantity: 1,
      }),
      /Availability changed/,
    );
  }
});
