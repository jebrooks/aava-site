import { loadSharedBlackoutDates } from './blackouts.ts';
import { BLACKOUT_SOURCE } from '../blackout-dates.ts';
import { isTourVariant, deliveryVariantTitle } from "../tour-fulfillment.ts";
import { resolveTourBoard } from "./tour-board-sync.ts";
import { randomUUID } from "node:crypto";
import { productServingLabel, servingAttributes } from '../serving-size.ts';
import {
  boardAttributes,
  getBoardConfiguration,
} from "../board-customization.ts";
import {
  eligibleTourDates,
  parseTourSchedule,
  localTourDate,
  addDays,
  addMonths,
  tourHandle,
  managedTourDate,
} from "../tour-schedule.ts";
import {
  validateTourRegistration,
  tourBookingAttributes,
} from "../tour-booking.ts";
import type { TourGraphql } from "./tours.ts";
import { TOUR_DELIVERY_METHOD_TITLE, type TourPickupAddress } from '../../data/tour-options.ts';
export interface BookingMoney {
  amount: string;
  currencyCode: string;
}
interface BookingVariant {
  id: string;
  title: string;
  availableForSale: boolean;
  quantityAvailable: number | null;
  requiresShipping: boolean;
  price: BookingMoney;
  selectedOptions: Array<{ name: string; value: string }>;
  servingCount?: { value: string } | null;
}
interface BookingProduct {
  id: string;
  handle: string;
  tags: string[];
  variants: { nodes: BookingVariant[] };
}
interface BookingCartLine {
  quantity: number;
  merchandise: { id: string; requiresShipping: boolean; price: BookingMoney };
  lineComponents?: Array<{ quantity: number; merchandise: { id: string } }>;
}
export interface BookingCart {
  id: string;
  checkoutUrl: string;
  lines: { nodes: BookingCartLine[] };
  attributes: Array<{ key: string; value: string }>;
  cost: { totalAmount: BookingMoney };
  deliveryGroups: { nodes: Array<{
    id: string;
    deliveryAddress: (Omit<TourPickupAddress, 'countryCode' | 'provinceCode'> & { countryCodeV2: string; provinceCode: string }) | null;
    deliveryOptions: BookingDeliveryOption[];
    selectedDeliveryOption: BookingDeliveryOption | null;
  }> };
}
interface BookingDeliveryOption {
  handle: string;
  title: string | null;
  deliveryMethodType: string;
  estimatedCost: BookingMoney;
}
export interface TourBookingDependencies {
  admin: TourGraphql;
  storefront: TourGraphql;
  now?: () => Date;
  collectionHandle?: string;
  tourBoardLocationId?: string;
}
const bookingCartFields = `id checkoutUrl attributes{key value} cost{totalAmount{amount currencyCode}}
  lines(first:10){nodes{quantity merchandise{... on ProductVariant{id requiresShipping price{amount currencyCode}}}
    ... on ComponentizableCartLine{lineComponents{quantity merchandise{... on ProductVariant{id}}}}}}
  deliveryGroups(first:5){nodes{id deliveryAddress{address1 address2 city provinceCode zip countryCodeV2}
    deliveryOptions{handle title deliveryMethodType estimatedCost{amount currencyCode}}
    selectedDeliveryOption{handle title deliveryMethodType estimatedCost{amount currencyCode}}}}`;
function normalizedAddress(value: string | undefined | null) {
  const abbreviations: Record<string, string> = { avenue: 'ave', boulevard: 'blvd', drive: 'dr', road: 'rd', street: 'st' };
  return (value || '').toLowerCase().replace(/[.,]/g, '').trim().split(/\s+/)
    .map(word => abbreviations[word] || word).join(' ');
}
const variantFields = `id title availableForSale quantityAvailable requiresShipping price{amount currencyCode} selectedOptions{name value} servingCount:metafield(namespace:"custom",key:"serving_count"){value}`;
export function tourBookingService(deps: TourBookingDependencies) {
  async function schedule() {
    const data = await deps.admin<{
      metaobjectByHandle: {
        fields: Array<{ key: string; value: string | null }>;
      } | null;
    }>(
      `query BookingSchedule{metaobjectByHandle(handle:{type:"tour_schedule",handle:"default"}){fields{key value}}}`,
    );
    if (!data.metaobjectByHandle)
      throw new Error(
        "Tour availability is temporarily unavailable. Please try again shortly.",
      );
    return parseTourSchedule(
      Object.fromEntries(
        data.metaobjectByHandle.fields.map((f) => [f.key, f.value || ""]),
      ),
      await loadSharedBlackoutDates(deps.admin),
    );
  }
  async function addOns() {
    const boards: Array<{
      id: string;
      handle: string;
      title: string;
      image: string | null;
      variants: BookingVariant[];
      customization: ReturnType<typeof getBoardConfiguration>;
      servingCount?: { value: string } | null;
      servingLabel: string;
    }> = [];
    let after: string | null = null;
    do {
      const data: {
        collection: {
          products: {
            nodes: Array<
              BookingProduct & {
                title: string;
                featuredImage: { url: string } | null;
                servingCount?: { value: string } | null;
              }
            >;
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
          };
        } | null;
      } = await deps.storefront(
        `query TourCatalogBoards($handle:String!,$after:String){collection(handle:$handle){
          products(first:50,after:$after){nodes{id handle title tags featuredImage{url} servingCount:metafield(namespace:"custom",key:"serving_count"){value} variants(first:100){nodes{${variantFields}}}}
            pageInfo{hasNextPage endCursor}}
        }}`,
        { handle: deps.collectionHandle || "charcuterie", after },
      );
      if (!data.collection)
        throw new Error("The charcuterie catalog is temporarily unavailable.");
      for (const product of data.collection.products.nodes) {
        const variants = product.variants.nodes
          .filter(
            (v) =>
              v.availableForSale && v.requiresShipping && !isTourVariant(v),
          )
          .map((v) => ({ ...v, title: deliveryVariantTitle(v) }));
        if (variants.length && !product.tags.includes("delivery-slot"))
          boards.push({
            id: product.id,
            handle: product.handle,
            title: product.title,
            image: product.featuredImage?.url || null,
            variants,
            customization: getBoardConfiguration(product.handle),
            servingCount: product.servingCount,
            servingLabel: productServingLabel({ ...product, variants: { nodes: variants } }),
          });
      }
      after = data.collection.products.pageInfo.hasNextPage
        ? data.collection.products.pageInfo.endCursor
        : null;
      if (data.collection.products.pageInfo.hasNextPage && !after)
        throw new Error("The charcuterie catalog is temporarily unavailable.");
    } while (after);
    return boards;
  }
  async function catalog(kind: "public" | "private") {
    const products: BookingProduct[] = [];
    let after: string | null = null;
    do {
      const result: {
        products: {
          nodes: BookingProduct[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      } = await deps.storefront(
        `query BookingTours($query:String!,$after:String){products(first:100,after:$after,query:$query){
          nodes{handle tags variants(first:2){nodes{${variantFields}}}} pageInfo{hasNextPage endCursor}
        }}`,
        {
          query: `tag:scheduled-tour tag:tour-${kind === "public" ? "seat" : "bus"}`,
          after,
        },
      );
      products.push(...result.products.nodes);
      after = result.products.pageInfo.hasNextPage
        ? result.products.pageInfo.endCursor
        : null;
      if (result.products.pageInfo.hasNextPage && !after)
        throw new Error("Tour availability is temporarily unavailable.");
    } while (after);
    return products;
  }
  async function availability(
    kind: "public" | "private",
    guests: number,
    month?: string,
  ) {
    if (
      !["public", "private"].includes(kind) ||
      !Number.isInteger(guests) ||
      guests < 1 ||
      guests > 10
    )
      throw new Error("Choose a valid tour type and guest count.");
    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw new Error("Choose a valid calendar month.");
    const now = deps.now?.() || new Date();
    const [config, products, addons] = await Promise.all([
      schedule(),
      catalog(kind),
      addOns(),
    ]);
    const today = localTourDate(now);
    const eligible = new Set(eligibleTourDates(config, now));
    const dates = products
      .flatMap((product) => {
        const date = managedTourDate(product.handle);
        const expectedKind = kind === "public" ? "seat" : "bus";
        const variant = product.variants.nodes[0];
        if (
          !date ||
          product.handle !== tourHandle(expectedKind, date) ||
          !product.tags.includes("scheduled-tour") ||
          !eligible.has(date) ||
          (month && !date.startsWith(month)) ||
          product.variants.nodes.length !== 1 ||
          !variant ||
          variant.requiresShipping
        )
          return [];
        const needed = kind === "public" ? guests : 1;
        const remaining = variant.quantityAvailable;
        // An unknown quantity must not be treated as sufficient public capacity.
        const available =
          variant.availableForSale && remaining !== null && remaining >= needed;
        return [
          { date, available, remaining: remaining ?? 0, price: variant.price },
        ];
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    return {
      today,
      blackoutSource: BLACKOUT_SOURCE,
      minimumDate: addDays(today, config.minimumDays),
      maximumDate: addMonths(today, config.monthsAhead),
      minimumDays: config.minimumDays,
      monthsAhead: config.monthsAhead,
      enabled: config.enabled,
      tourType: kind,
      guests,
      dates,
      addons,
    };
  }
  async function checkout(input: Record<string, unknown>) {
    const booking = validateTourRegistration(input);
    const now = deps.now?.() || new Date();
    const config = await schedule();
    if (!eligibleTourDates(config, now).includes(booking.date))
      throw new Error(
        "That date is no longer available. Please choose another date.",
      );
    const handle = tourHandle(
      booking.tourType === "public" ? "seat" : "bus",
      booking.date,
    );
    const result = await deps.storefront<{ product: BookingProduct | null }>(
      `query BookingDeparture($handle:String!){
      product(handle:$handle){handle tags variants(first:2){nodes{${variantFields}}}}
    }`,
      { handle },
    );
    const product = result.product,
      variant = product?.variants.nodes[0];
    const quantity = booking.tourType === "public" ? booking.guests : 1;
    if (
      !product ||
      product.handle !== handle ||
      !product.tags.includes("scheduled-tour") ||
      product.variants.nodes.length !== 1 ||
      !variant ||
      variant.requiresShipping ||
      !variant.availableForSale ||
      variant.quantityAvailable === null ||
      variant.quantityAvailable < quantity
    ) {
      throw new Error(
        booking.tourType === "private"
          ? "The whole bus is no longer available on that date. Please choose another date."
          : "There are no longer enough seats for your group. Please choose another date.",
      );
    }
    const attributes = tourBookingAttributes(booking, now, randomUUID());
    const lineAttributes = attributes.filter((a) =>
      [
        "Tour date",
        "Tour type",
        "Guest count",
        "Destination",
        "Snack",
        "Pickup preference",
        "Pickup arrangements",
        "Tentative fulfillment address",
      ].includes(a.key),
    );
    const prices = new Map([[variant.id, Number(variant.price.amount)]]);
    const physical = new Map([[variant.id, false]]);
    const lines = [
      { merchandiseId: variant.id, quantity, attributes: lineAttributes },
    ];
    if (booking.snack === "charcuterie") {
      const boards = await addOns();
      const board = boards.find((b) =>
        b.variants.some((v) => v.id === booking.boardVariantId),
      );
      const addon = board?.variants.find(
        (v) => v.id === booking.boardVariantId,
      );
      if (!board || !addon || !addon.availableForSale)
        throw new Error(
          "That catalog board is no longer available in the requested quantity. Choose another board or snack.",
        );
      const selections = boardAttributes(board.handle, booking.boardSelections);
      const onTour = await resolveTourBoard(
        deps.admin,
        board.id,
        addon.id,
        deps.collectionHandle || "charcuterie",
        deps.tourBoardLocationId,
      );
      if (Number(onTour.price) !== Number(addon.price.amount))
        throw new Error(
          "The catalog price just changed. Refresh the page before checkout.",
        );
      prices.set(onTour.id, Number(onTour.price));
      physical.set(onTour.id, true);
      lines.push({
        merchandiseId: onTour.id,
        quantity: booking.boardQuantity,
        attributes: [
          ...lineAttributes.filter((attribute) => attribute.key !== "Destination"),
          ...selections,
          ...servingAttributes(board, addon),
          {
            key: "Fulfillment",
            value: "Provided on the bus",
          },
        ],
      });
    }
    const digits = booking.phone.replace(/\D/g, "");
    const phone = "+" + (digits.length === 10 ? "1" : "") + digits;
    const nameParts = booking.name.split(/\s+/);
    const lastName = nameParts.pop()!;
    const created = await deps.storefront<{
      cartCreate: {
        cart: BookingCart | null;
        userErrors: Array<{ message: string }>;
        warnings: Array<{ message: string }>;
      };
    }>(
      `mutation CreateTourBooking($input:CartInput!){cartCreate(input:$input){
        cart{${bookingCartFields}}
        userErrors{message} warnings{message}
      }}`,
      {
        input: {
          lines,
          attributes,
          buyerIdentity: { email: booking.email, phone, countryCode: "US" },
          ...(booking.pickupAddress ? { delivery: { addresses: [{
            address: { deliveryAddress: { ...booking.pickupAddress, firstName: nameParts.join(' '), lastName, phone } },
            selected: true, oneTimeUse: true, validationStrategy: 'STRICT',
          }] } } : {}),
          note: `Tour booking: ${booking.date} — ${booking.tourType}. Destination and pickup details to coordinate by phone.`,
        },
      },
    );
    const payload = created.cartCreate;
    if (payload.userErrors.length)
      throw new Error(payload.userErrors.map((e) => e.message).join("; "));
    const validLines = (cart: BookingCart | null) => !!cart &&
      cart.lines.nodes.length === lines.length && !lines.some(
        (expected) =>
          !cart.lines.nodes.some(
            (actual) =>
              actual.merchandise.id === expected.merchandiseId &&
              actual.quantity === expected.quantity &&
              actual.merchandise.requiresShipping === physical.get(expected.merchandiseId) &&
              actual.merchandise.price.currencyCode === 'USD' &&
              Number(actual.merchandise.price.amount) ===
                prices.get(expected.merchandiseId),
          ),
      );
    // Shopify can adjust or drop lines when capacity changes. Do not send a partial booking to payment.
    if (payload.warnings?.length || !validLines(payload.cart)) {
      throw new Error(
        "Availability changed while preparing checkout. Please check your date and try again.",
      );
    }
    let cart = payload.cart!;
    if (booking.pickupAddress) {
      // Fixed profile rates can become available immediately after cart creation.
      if (!cart.deliveryGroups?.nodes.length) {
        const refreshed = await deps.storefront<{ cart: BookingCart | null }>(
          `query TourBookingDelivery($id:ID!){cart(id:$id){${bookingCartFields}}}`, { id: cart.id });
        if (!validLines(refreshed.cart)) throw new Error('Availability changed while preparing checkout. Please check your date and try again.');
        cart = refreshed.cart!;
      }
      const deliveryError = 'Tour food fulfillment is temporarily unavailable. Please contact us or choose a tour without a board.';
      const validateDelivery = (candidate: BookingCart) => {
        const groups = candidate.deliveryGroups?.nodes || [];
        if (groups.length !== 1) throw new Error(deliveryError);
        const group = groups[0], address = group.deliveryAddress, expected = booking.pickupAddress!;
        if (!address || !address.city || !address.zip || address.countryCodeV2 !== 'US' || address.provinceCode !== 'VA' ||
          address.zip.slice(0, 5) !== expected.zip.slice(0, 5) ||
          normalizedAddress(address.address1) !== normalizedAddress(expected.address1) ||
          normalizedAddress(address.address2) !== normalizedAddress(expected.address2)) throw new Error(deliveryError);
        const options = group.deliveryOptions;
        if (options.length !== 1) throw new Error(deliveryError);
        const option = options[0];
        if (option.title !== TOUR_DELIVERY_METHOD_TITLE || option.deliveryMethodType !== 'SHIPPING' ||
          option.estimatedCost.currencyCode !== 'USD' || Number(option.estimatedCost.amount) !== 0) throw new Error(deliveryError);
        return { group, option };
      };
      const { group, option } = validateDelivery(cart);
      const selected = await deps.storefront<{ cartSelectedDeliveryOptionsUpdate: {
        cart: BookingCart | null; userErrors: Array<{ message: string }>; warnings: Array<{ message: string }>;
      } }>(`mutation SelectTourDelivery($cartId:ID!,$options:[CartSelectedDeliveryOptionInput!]!){
        cartSelectedDeliveryOptionsUpdate(cartId:$cartId,selectedDeliveryOptions:$options){
          cart{${bookingCartFields}} userErrors{message} warnings{message}
        }}`, { cartId: cart.id, options: [{ deliveryGroupId: group.id, deliveryOptionHandle: option.handle }] });
      const updated = selected.cartSelectedDeliveryOptionsUpdate;
      if (updated.userErrors.length || updated.warnings?.length || !validLines(updated.cart)) throw new Error(deliveryError);
      cart = updated.cart!;
      const verified = validateDelivery(cart);
      if (verified.group.selectedDeliveryOption?.handle !== verified.option.handle ||
        verified.group.selectedDeliveryOption.title !== TOUR_DELIVERY_METHOD_TITLE ||
        Number(verified.group.selectedDeliveryOption.estimatedCost.amount) !== 0 ||
        verified.group.selectedDeliveryOption.estimatedCost.currencyCode !== 'USD' ||
        verified.group.selectedDeliveryOption.deliveryMethodType !== 'SHIPPING') throw new Error(deliveryError);
    }
    const checkoutUrl = new URL(cart.checkoutUrl);
    if (checkoutUrl.protocol !== "https:")
      throw new Error("Secure checkout is temporarily unavailable.");
    return { checkoutUrl: checkoutUrl.toString() };
  }
  return { availability, checkout };
}
