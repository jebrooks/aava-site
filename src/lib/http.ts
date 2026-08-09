import { ShopifyApiError } from './shopify/client';

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function apiError(error: unknown) {
  if (error instanceof ShopifyApiError) {
    return json({ error: error.message }, { status: error.status });
  }

  console.error(error);
  return json({ error: 'An unexpected server error occurred.' }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new ShopifyApiError('Expected an application/json request.', 415);
  }
  return request.json() as Promise<T>;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw new ShopifyApiError('Cross-origin requests are not allowed.', 403);
  }
}
