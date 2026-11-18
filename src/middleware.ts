import { createHash, timingSafeEqual } from 'node:crypto';
import { defineMiddleware } from 'astro:middleware';

const cronPaths = new Set([
  '/api/cron/materialize-delivery',
  '/api/cron/materialize-tours',
]);

const cacheControl = 'private, no-store';

function digest(value: string) {
  return createHash('sha256').update(value).digest();
}

export const onRequest = defineMiddleware(async ({ request, url }, next) => {
  const password = import.meta.env.SITE_ACCESS_PASSWORD;
  if (!password) return next();

  // These handlers enforce their own Shopify signature or cron bearer secret.
  const isWebhook = request.method === 'POST' && url.pathname === '/api/shopify/webhooks';
  const isCron = request.method === 'GET' && cronPaths.has(url.pathname);
  if (isWebhook || isCron) return next();

  const credentials = request.headers.get('Authorization')?.match(/^Basic (\S+)$/i)?.[1];
  const expected = Buffer.from(`visitor:${password}`, 'utf8').toString('base64');
  if (!credentials || !timingSafeEqual(digest(credentials), digest(expected))) {
    return new Response('Enter the site password using the username visitor.', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="All ABoard VA", charset="UTF-8"',
        'Cache-Control': cacheControl,
      },
    });
  }

  const response = await next();
  const headers = new Headers(response.headers);
  headers.delete('CDN-Cache-Control');
  headers.delete('Vercel-CDN-Cache-Control');
  headers.set('Cache-Control', cacheControl);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
