import type { APIRoute } from "astro";
import { json, apiError, assertSameOrigin } from "../../../lib/http";
import {
  adminGraphql,
  storefrontGraphql,
  ShopifyApiError,
} from "../../../lib/shopify/client";
import { tourBookingService } from "../../../lib/shopify/tour-booking";
import { allowRequest } from "../../../lib/rate-limit";
export const prerender = false;
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    assertSameOrigin(request);
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new ShopifyApiError("Expected a booking request.", 415);
    if (!allowRequest(`tour-checkout:${clientAddress}`, 20))
      throw new ShopifyApiError(
        "Please wait a few minutes before trying again.",
        429,
      );
    const raw = await request.text();
    if (raw.length > 16_000)
      throw new ShopifyApiError("Booking details are too long.", 413);
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new ShopifyApiError("Invalid booking request.", 400);
    }
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new ShopifyApiError("Invalid booking request.", 400);
    try {
      return json(
        await tourBookingService({
          admin: adminGraphql,
          storefront: storefrontGraphql,
          collectionHandle:
            import.meta.env.SHOPIFY_CHARCUTERIE_COLLECTION_HANDLE ||
            "charcuterie",
        }).checkout(input as Record<string, unknown>),
      );
    } catch (error) {
      if (error instanceof ShopifyApiError) throw error;
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to prepare checkout. Please try again.",
        },
        { status: 400 },
      );
    }
  } catch (error) {
    return apiError(error);
  }
};
