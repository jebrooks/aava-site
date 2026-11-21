import type { ShopifyCart } from './shopify/types';

export const CART_ID_KEY = 'aava-shopify-cart-id';
export const CART_COUNT_KEY = 'aava-shopify-cart-count';
export const CART_NOT_FOUND = 'CART_NOT_FOUND';

export function isMissingCartResponse(response: { status: number }, result: { code?: unknown } | null | undefined) {
  return response.status === 404 && result?.code === CART_NOT_FOUND;
}

type CartStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function clearCartSession(storage: CartStorage) {
  storage.removeItem(CART_ID_KEY);
  storage.setItem(CART_COUNT_KEY, '0');
}

export async function loadStoredCart(storage: CartStorage, fetcher: typeof fetch = fetch): Promise<ShopifyCart | null> {
  const id = storage.getItem(CART_ID_KEY);
  if (!id) {
    clearCartSession(storage);
    return null;
  }
  const response = await fetcher(`/api/cart?id=${encodeURIComponent(id)}`);
  const result = await response.json() as { cart?: ShopifyCart; code?: unknown; error?: string } | null;
  if (isMissingCartResponse(response, result)) {
    clearCartSession(storage);
    return null;
  }
  if (!response.ok) throw new Error(result?.error || 'Could not load the cart. Please try again.');
  if (!result?.cart) throw new Error('Could not load the cart. Please try again.');
  return result.cart;
}
