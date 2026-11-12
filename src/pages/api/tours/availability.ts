import type { APIRoute } from "astro";
import { json, apiError } from "../../../lib/http";
import {
  adminGraphql,
  storefrontGraphql,
  ShopifyApiError,
} from "../../../lib/shopify/client";
import { tourBookingService } from "../../../lib/shopify/tour-booking";
export const prerender = false;
export const GET: APIRoute = async ({ url }) => {
  try {
    const type = url.searchParams.get("type") || "public";
    const guests = Number(url.searchParams.get("guests") || "1");
    if (
      !["public", "private"].includes(type) ||
      !Number.isInteger(guests) ||
      guests < 1 ||
      guests > 10
    )
      throw new ShopifyApiError(
        "Choose a valid tour type and guest count.",
        400,
      );
    const month = url.searchParams.get("month") || undefined;
    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw new ShopifyApiError("Choose a valid calendar month.", 400);
    return json(
      await tourBookingService({
        admin: adminGraphql,
        storefront: storefrontGraphql,
        collectionHandle:
          import.meta.env.SHOPIFY_CHARCUTERIE_COLLECTION_HANDLE ||
          "charcuterie",
      }).availability(type as "public" | "private", guests, month),
    );
  } catch (error) {
    return apiError(error);
  }
};
