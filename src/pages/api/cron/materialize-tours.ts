import type { APIRoute } from 'astro';
import { apiError, json } from '../../../lib/http';
import { adminGraphql, ShopifyApiError } from '../../../lib/shopify/client';
import { syncTourCatalog } from '../../../lib/shopify/tours';
export const prerender = false;
export const GET: APIRoute = async ({ request }) => {
  try {
    const secret = import.meta.env.CRON_SECRET || '';
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
      throw new ShopifyApiError('Unauthorized.', 401);
    }
    const result = await syncTourCatalog({
      graphql: adminGraphql,
      locationId: import.meta.env.SHOPIFY_DELIVERY_LOCATION_ID || '',
      publicationId: import.meta.env.SHOPIFY_STOREFRONT_PUBLICATION_ID || '',
    });
    return json(result);
  } catch (error) { return apiError(error); }
};
