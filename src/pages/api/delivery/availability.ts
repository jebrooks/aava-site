import type { APIRoute } from 'astro';
import { apiError, json } from '../../../lib/http';
import { allowRequest } from '../../../lib/rate-limit';
import { ShopifyApiError } from '../../../lib/shopify/client';
import { getAvailableDeliverySlots } from '../../../lib/shopify/schedule';

export const prerender = false;

export const GET: APIRoute = async ({ url, request }) => {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!allowRequest(`delivery:${ip}`, 60, 60 * 1000)) {
      throw new ShopifyApiError('Too many availability requests.', 429);
    }
    const availability = await getAvailableDeliverySlots(url.searchParams.get('zip') || '');
    return json(availability);
  } catch (error) {
    return apiError(error);
  }
};
