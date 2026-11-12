import { isTourVariant, deliveryVariantTitle } from "../tour-fulfillment.ts";
import { resolveTourBoard } from "./tour-board-sync.ts";
import { randomUUID } from "node:crypto";
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
  checkoutUrl: string;
  lines: { nodes: BookingCartLine[] };
  attributes: Array<{ key: string; value: string }>;
  cost: { totalAmount: BookingMoney };
}
export interface TourBookingDependencies {
  admin: TourGraphql;
  storefront: TourGraphql;
  now?: () => Date;
  collectionHandle?: string;
}
const variantFields = `id title availableForSale quantityAvailable requiresShipping price{amount currencyCode} selectedOptions{name value}`;
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
              }
            >;
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
          };
        } | null;
      } = await deps.storefront(
        `query TourCatalogBoards($handle:String!,$after:String){collection(handle:$handle){
          products(first:50,after:$after){nodes{id handle title tags featuredImage{url} variants(first:100){nodes{${variantFields}}}}
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
      ].includes(a.key),
    );
    const prices = new Map([[variant.id, Number(variant.price.amount)]]);
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
      );
      if (Number(onTour.price) !== Number(addon.price.amount))
        throw new Error(
          "The catalog price just changed. Refresh the page before checkout.",
        );
      prices.set(onTour.id, Number(onTour.price));
      lines.push({
        merchandiseId: onTour.id,
        quantity: booking.boardQuantity,
        attributes: [
          ...lineAttributes,
          ...selections,
          {
            key: "Tour food fulfillment",
            value: "Bring with tour on " + booking.date,
          },
        ],
      });
    }
    const digits = booking.phone.replace(/\D/g, "");
    const phone = "+" + (digits.length === 10 ? "1" : "") + digits;
    const created = await deps.storefront<{
      cartCreate: {
        cart: BookingCart | null;
        userErrors: Array<{ message: string }>;
        warnings: Array<{ message: string }>;
      };
    }>(
      `mutation CreateTourBooking($input:CartInput!){cartCreate(input:$input){
        cart{checkoutUrl attributes{key value} cost{totalAmount{amount currencyCode}} lines(first:10){nodes{
          quantity merchandise{... on ProductVariant{id requiresShipping price{amount currencyCode}}}
          ... on ComponentizableCartLine{lineComponents{quantity merchandise{... on ProductVariant{id}}}}
        }}}
        userErrors{message} warnings{message}
      }}`,
      {
        input: {
          lines,
          attributes,
          buyerIdentity: { email: booking.email, phone, countryCode: "US" },
          note: `Tour booking: ${booking.date} — ${booking.tourType}. Destination and pickup details to coordinate by phone.`,
        },
      },
    );
    const payload = created.cartCreate;
    if (payload.userErrors.length)
      throw new Error(payload.userErrors.map((e) => e.message).join("; "));
    // Shopify can adjust or drop lines when capacity changes. Do not send a partial booking to payment.
    if (
      payload.warnings?.length ||
      !payload.cart ||
      payload.cart.lines.nodes.length !== lines.length ||
      lines.some(
        (expected) =>
          !payload.cart!.lines.nodes.some(
            (actual) =>
              actual.merchandise.id === expected.merchandiseId &&
              actual.quantity === expected.quantity &&
              !actual.merchandise.requiresShipping &&
              Number(actual.merchandise.price.amount) ===
                prices.get(expected.merchandiseId),
          ),
      )
    ) {
      throw new Error(
        "Availability changed while preparing checkout. Please check your date and try again.",
      );
    }
    const checkoutUrl = new URL(payload.cart.checkoutUrl);
    if (checkoutUrl.protocol !== "https:")
      throw new Error("Secure checkout is temporarily unavailable.");
    return { checkoutUrl: checkoutUrl.toString() };
  }
  return { availability, checkout };
}
