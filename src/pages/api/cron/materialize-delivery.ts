import type { APIRoute } from 'astro';
import { apiError, json } from '../../../lib/http';
import { ShopifyApiError } from '../../../lib/shopify/client';
import { materializeDeliverySlots } from '../../../lib/shopify/schedule';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    const secret = import.meta.env.CRON_SECRET || '';
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
      throw new ShopifyApiError('Unauthorized.', 401);
    }
    return json(await materializeDeliverySlots());
  } catch (error) {
    return apiError(error);
  }
};
