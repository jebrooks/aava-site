import type { APIRoute } from 'astro';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { json } from '../../../lib/http';

export const prerender = false;

function validSignature(body: string, signature: string, secret: string) {
  const expected = createHmac('sha256', secret).update(body, 'utf8').digest('base64');
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(signature);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.SHOPIFY_WEBHOOK_SECRET || '';
  const signature = request.headers.get('x-shopify-hmac-sha256') || '';
  const topic = request.headers.get('x-shopify-topic') || 'unknown';
  const shop = request.headers.get('x-shopify-shop-domain') || 'unknown';
  const body = await request.text();

  if (!secret) return json({ error: 'Webhook verification is not configured.' }, { status: 503 });
  if (!signature || !validSignature(body, signature, secret)) {
    return json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }

  // Inventory is enforced by Shopify itself, so these webhooks are operational signals rather
  // than a second source of truth. Vercel retains the structured log for troubleshooting.
  console.info(JSON.stringify({ event: 'shopify_webhook', topic, shop, receivedAt: new Date().toISOString() }));
  return json({ accepted: true });
};
