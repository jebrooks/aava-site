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
import { DEFAULT_TOUR_PICKUP, TOUR_PICKUP_ADDRESSES, TOUR_DELIVERY_METHOD_TITLE } from '../src/data/tour-options.ts';
import { boardAttributes, getBoardConfiguration } from '../src/lib/board-customization.ts';
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
    blackouts: "",
    missingBlackouts: false,
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
      seat_price: "125.00",
      bus_price: "1250.00",
    },
    remaining: 10,
    cartInput: null,
    cartWarning: false,
    dropBoard: false,
    wrongPrice: false,
    nonShippingBoard: false,
    shippingService: false,
    wrongQuantity: false,
    wrongCurrency: false,
    deliveryMode: '',
    selectedOptions: [],
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
    servingCount: { value: '4' },
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
      inventoryItem: { tracked: false, requiresShipping: true, sku: null,
        inventoryLevels: { nodes: [{ id: 'tour-level', location: { id: 'gid://shopify/Location/99' } }], pageInfo: { hasNextPage: false } } },
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
    if (query.includes('query TourBoardFulfillmentLocation'))
      return { location: { id: 'gid://shopify/Location/99', isActive: true, fulfillsOnlineOrders: true } };
    if (query.includes("query SharedBlackoutDates")) return {metaobjectByHandle:state.missingBlackouts?null:{fields:[{key:"dates",value:state.blackouts}]}};
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
  function cart(selected = false) {
    const input = state.cartInput;
    const option = { handle: 'tour-delivery', title: TOUR_DELIVERY_METHOD_TITLE, deliveryMethodType: 'SHIPPING', estimatedCost: { amount: '0.00', currencyCode: 'USD' } };
    if (state.deliveryMode === 'paid') option.estimatedCost.amount = '5.00';
    if (state.deliveryMode === 'wrongTitle') option.title = 'Ordinary delivery';
    if (state.deliveryMode === 'localDelivery') option.deliveryMethodType = 'LOCAL';
    if (state.deliveryMode === 'wrongDeliveryCurrency') option.estimatedCost.currencyCode = 'CAD';
    const address = input.delivery?.addresses[0].address.deliveryAddress;
    const group = address ? { id: 'tour-delivery-group', deliveryAddress: { ...address, countryCodeV2: address.countryCode },
      deliveryOptions: [option], selectedDeliveryOption: selected ? { ...option } : null } : null;
    if (group && state.deliveryMode === 'wrongState') group.deliveryAddress.provinceCode = 'DC';
    if (group && state.deliveryMode === 'wrongStreet') group.deliveryAddress.address1 = '1 Other Street';
    if (group && state.deliveryMode === 'missingZip') group.deliveryAddress.zip = null;
    if (group && state.deliveryMode === 'extra') group.deliveryOptions.push({ ...option, handle: 'another' });
    if (group && selected && state.deliveryMode === 'selectionMismatch') group.selectedDeliveryOption.handle = 'different-method';
    return { id: 'gid://shopify/Cart/test', checkoutUrl: 'https://example.myshopify.com/checkouts/test',
      attributes: input.attributes, cost: { totalAmount: { amount: '250.00', currencyCode: 'USD' } },
      lines: { nodes: input.lines.filter((_, i) => !state.dropBoard || i === 0).map(line => ({
        quantity: state.wrongQuantity ? 99 : line.quantity,
        merchandise: { id: line.merchandiseId,
          requiresShipping: line.merchandiseId === tourId ? !state.nonShippingBoard : state.shippingService,
          price: { amount: state.wrongPrice ? '0.01' : line.merchandiseId === tourId ? '59.00' : line.merchandiseId.startsWith('tour-bus') ? '1250.00' : '125.00', currencyCode: state.wrongCurrency ? 'CAD' : 'USD' } },
      })) }, deliveryGroups: { nodes: group && state.deliveryMode !== 'missing' ? [group] : [] } };
  }
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
      return {
        cartCreate: {
          cart: cart(),
          userErrors: [],
          warnings: state.cartWarning ? [{ message: "Quantity adjusted" }] : [],
        },
      };
    }
    if (query.includes('query TourBookingDelivery')) return { cart: cart() };
    if (query.includes('mutation SelectTourDelivery')) {
      state.selectedOptions.push(v.options);
      const result = cart(true);
      if (state.deliveryMode === 'dropAfterSelection') result.lines.nodes.pop();
      return { cartSelectedDeliveryOptionsUpdate: { cart: result, userErrors: [], warnings: state.deliveryMode === 'selectionWarning' ? [{ message: 'Changed' }] : [] } };
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
      tourBoardLocationId: 'gid://shopify/Location/99',
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
  state.blackouts = "2026-11-14";
  assert.equal((await service.availability("public", 1)).dates.length, 0);
  assert.equal((await service.availability("private", 1)).dates.length, 0);
  await assert.rejects(()=>service.checkout(base), /date is no longer available/);
  await assert.rejects(()=>service.checkout({...base,tourType:"private"}), /date is no longer available/);
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
test("catalog boards use physical counterparts and select the verified free tour method", async () => {
  const { state, service } = fixture();
  await service.checkout({
    ...base,
    snack: "charcuterie",
    boardVariantId: sourceId,
    boardQuantity: 2,
  });
  assert.equal(state.cartInput.lines[1].merchandiseId, tourId);
  assert.equal(state.cartInput.lines[1].quantity, 2);
  assert.ok(state.cartInput.lines[1].attributes.some(attribute => attribute.key === 'Serves' && attribute.value === '4'));
  assert.equal(state.cartInput.buyerIdentity.preferences, undefined);
  assert.equal(state.cartInput.buyerIdentity.billingAddress, undefined);
  assert.equal(state.cartInput.delivery.addresses[0].oneTimeUse, true);
  assert.equal(state.cartInput.delivery.addresses[0].selected, true);
  assert.equal(state.cartInput.delivery.addresses[0].validationStrategy, 'STRICT');
  assert.equal(state.cartInput.delivery.addresses[0].address.deliveryAddress.address1, TOUR_PICKUP_ADDRESSES[DEFAULT_TOUR_PICKUP].address1);
  assert.deepEqual(state.selectedOptions, [[{ deliveryGroupId: 'tour-delivery-group', deliveryOptionHandle: 'tour-delivery' }]]);
  assert.ok(
    state.cartInput.lines[1].attributes.some(
      (a) => a.key === "Fulfillment" && a.value === "Provided on the bus",
    ),
  );
});

test('tour-only bookings never acquire a default address, including stale board input', async () => {
  for (const pickup of ['', undefined, 'Arrange by phone', 'Ballston Metro']) {
    const { state, service } = fixture();
    await service.checkout({ ...base, pickup, boardVariantId: sourceId, boardQuantity: 2,
      customPickupStreet: '1 Stale Street', customPickupCity: 'Washington', customPickupState: 'DC' });
    assert.equal(state.cartInput.delivery, undefined);
    assert.equal(state.cartInput.lines.length, 1);
    assert.equal(state.selectedOptions.length, 0);
    assert.ok(!state.cartInput.attributes.some(a => a.key === 'Tentative fulfillment address'));
    assert.ok(!JSON.stringify(state.cartInput).includes(DEFAULT_TOUR_PICKUP));
    assert.equal(state.cartInput.attributes.find(a => a.key === 'Pickup preference').value,
      pickup || 'No preference');
    assert.match(state.cartInput.lines[0].attributes.find(a => a.key === 'Pickup arrangements').value, /Tentative.*phone/);
  }
});

test('a board without a pickup preference uses a visible tentative default without replacing the preference', async () => {
  for (const pickup of ['', undefined, 'Arrange by phone']) {
    const { state, service } = fixture();
    await service.checkout({ ...base, pickup, snack: 'charcuterie', boardVariantId: sourceId, boardQuantity: 1 });
    assert.equal(state.cartInput.attributes.find(a => a.key === 'Pickup preference').value, pickup || 'No preference');
    for (const attributes of [state.cartInput.attributes, state.cartInput.lines[0].attributes]) {
      assert.match(attributes.find(a => a.key === 'Tentative fulfillment address').value, /NorthSide Social.*3211 Wilson Blvd/);
      assert.match(attributes.find(a => a.key === 'Pickup arrangements').value, /No preference is fine.*phone.*default address is tentative.*not a confirmed meeting point/);
    }
  }
});

test('all named pickup addresses are server-owned Virginia locations, including legacy Reston drafts', () => {
  for (const [pickup, expected] of Object.entries(TOUR_PICKUP_ADDRESSES)) {
    const booking = validateTourRegistration({ ...base, pickup, snack: 'charcuterie', boardVariantId: sourceId, boardQuantity: 1,
      pickupAddress: { address1: 'Forged', provinceCode: 'DC', zip: '20001' }, customPickupStreet: 'Forged' });
    assert.deepEqual(booking.pickupAddress, expected);
    assert.equal(booking.pickupAddress.provinceCode, 'VA');
  }
  const legacy = validateTourRegistration({ ...base, pickup: 'Reston Metro', snack: 'charcuterie', boardVariantId: sourceId, boardQuantity: 1 });
  assert.equal(legacy.pickup, 'Reston Town Center Metro');
  assert.equal(legacy.pickupAddress.address1, '12023-A Sunset Hills Rd');
});

test('private custom board pickup requires a complete Virginia address and preserves it as tentative', async () => {
  const custom = { ...base, tourType: 'private', pickup: 'Custom pickup (private tours)', snack: 'charcuterie',
    boardVariantId: sourceId, boardQuantity: 1, customPickupStreet: '123 Test Street', customPickupAddress2: 'Suite 4',
    customPickupCity: 'Arlington', customPickupState: 'VA', customPickupCountry: 'US', customPickupZip: '22205' };
  for (const change of [{ customPickupStreet: '' }, { customPickupCity: '' }, { customPickupZip: '' },
    { customPickupZip: 'bad' }, { customPickupState: 'DC' }, { customPickupCountry: 'CA' }]) {
    const { state, service } = fixture();
    await assert.rejects(service.checkout({ ...custom, ...change }), /pickup/);
    assert.equal(state.cartInput, null);
  }
  const { state, service } = fixture();
  await service.checkout(custom);
  const address = state.cartInput.delivery.addresses[0].address.deliveryAddress;
  assert.equal(address.address1, custom.customPickupStreet);
  assert.equal(address.address2, 'Suite 4');
  assert.equal(address.provinceCode, 'VA');
  assert.ok(!JSON.stringify(state.cartInput).includes(DEFAULT_TOUR_PICKUP));
  assert.match(state.cartInput.attributes.find(a => a.key === 'Custom pickup address').value, /123 Test Street.*Arlington.*22205/);
  assert.equal(state.cartInput.lines[0].attributes.find(a => a.key === 'Pickup arrangements').value,
    'Your pickup preference is tentative — we’ll confirm the meeting point by phone.');
});

test('tour board checkout rejects missing, paid, extra, changed or non-tour delivery choices', async () => {
  for (const deliveryMode of ['missing', 'paid', 'wrongTitle', 'localDelivery', 'wrongDeliveryCurrency', 'extra', 'wrongState', 'wrongStreet', 'missingZip', 'selectionMismatch', 'selectionWarning', 'dropAfterSelection']) {
    const { state, service } = fixture(); state.deliveryMode = deliveryMode;
    await assert.rejects(service.checkout({ ...base, snack: 'charcuterie', boardVariantId: sourceId, boardQuantity: 1 }),
      /Tour food fulfillment is temporarily unavailable/, deliveryMode);
  }
});

test('tour board availability carries variant counts and product fallback counts', async () => {
  const { product, service } = fixture();
  const available = await service.availability('public', 2);
  assert.equal(available.addons[0].servingLabel, 'Serves 4');
  assert.equal(available.addons[0].variants[0].servingCount.value, '4');
  delete product.variants.nodes[0].servingCount;
  product.servingCount = { value: '10' };
  const single = await service.availability('public', 2);
  assert.equal(single.addons[0].servingLabel, 'Serves 10');
});
test("tour details stay on the tour line and order; board lines contain only board details", async () => {
  for (const tourType of ["public", "private"]) {
    const { state, service } = fixture();
    await service.checkout({
      ...base,
      tourType,
      snack: "charcuterie",
      boardVariantId: sourceId,
      boardQuantity: 2,
    });
    const tourAttributes = state.cartInput.lines[0].attributes;
    const boardAttributes = state.cartInput.lines[1].attributes;
    for (const key of ['Tour date', 'Tour type', 'Guest count', 'Destination', 'Snack',
      'Pickup preference', 'Pickup arrangements', 'Tentative fulfillment address']) {
      const saved = state.cartInput.attributes.find(a => a.key === key);
      assert.ok(saved?.value, key);
      assert.deepEqual(tourAttributes.find(a => a.key === key), saved, key);
    }
    assert.deepEqual(boardAttributes, [
      { key: 'Serves', value: '4' },
      { key: 'Fulfillment', value: 'Provided on the bus' },
    ]);
  }
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
test("build-your-own boards retain ingredient choices without tour properties", async () => {
  const { state, product, syncProduct, service } = fixture();
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
  const config = getBoardConfiguration(product.handle);
  const boardSelections = {
    preference: 'With meat', cheeses: config.cheeses.slice(0, 2),
    meats: config.meats.slice(0, 1), accompaniments: config.accompaniments.slice(0, 5),
  };
  await service.checkout({ ...base, snack: 'charcuterie', boardVariantId: sourceId,
    boardQuantity: 1, boardSelections });
  assert.deepEqual(state.cartInput.lines[1].attributes, [
    ...boardAttributes(product.handle, boardSelections),
    { key: 'Serves', value: '4' },
    { key: 'Fulfillment', value: 'Provided on the bus' },
  ]);
});
test("warnings, lost lines, changed prices or quantities and wrong physical line kinds block handoff", async () => {
  for (const mode of [
    "cartWarning",
    "dropBoard",
    "wrongPrice",
    "nonShippingBoard",
    "shippingService",
    "wrongQuantity",
    "wrongCurrency",
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

test('missing or invalid shared dates refuse availability and checkout',async()=>{
 const {state,service}=fixture();
 state.missingBlackouts=true;
 await assert.rejects(()=>service.availability('public',2),/booking_blackouts\/default/);
 state.missingBlackouts=false;state.blackouts='2026-02-30';
 await assert.rejects(()=>service.availability('public',2),/Invalid blackout/);
 await assert.rejects(()=>service.checkout(base),/Invalid blackout/);
 assert.equal(state.cartInput,null);
});
