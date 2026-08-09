import type { APIRoute } from 'astro';
import { isShopifyConfigured } from '../lib/shopify/config';
import { listCharcuterieProducts } from '../lib/shopify/storefront';

export const prerender = false;

const staticPaths = [
  '/',
  '/experiences',
  '/charcuterie',
  '/charcuterie-menu',
  '/custom-board-request',
  '/experience-guide',
  '/about',
  '/contact',
];

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export const GET: APIRoute = async ({ site }) => {
  const base = site || new URL('https://www.allaboardva.com');
  const paths = [...staticPaths];
  if (isShopifyConfigured()) {
    try {
      const collection = await listCharcuterieProducts(100);
      paths.push(...collection.products.nodes.map((product) => `/charcuterie-menu/p/${product.handle}`));
    } catch (error) {
      console.error('Unable to include Shopify products in the sitemap.', error);
    }
  }

  const urls = paths.map((path) => `  <url><loc>${escapeXml(new URL(path, base).toString())}</loc></url>`);
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=300' } },
  );
};
