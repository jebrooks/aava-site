import type { ShopifyCart } from './shopify/types';

export const CART_ID_KEY = 'aava-shopify-cart-id';
export const CART_COUNT_KEY = 'aava-shopify-cart-count';
export const CART_CHECKOUT_KEY = 'aava-shopify-checkout-cart-id';
export const CART_NOT_FOUND = 'CART_NOT_FOUND';

export function isMissingCartResponse(response: { status: number }, result: { code?: unknown } | null | undefined) {
  return response.status === 404 && result?.code === CART_NOT_FOUND;
}

type CartStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function clearCartSession(storage: CartStorage) {
  storage.removeItem(CART_ID_KEY);
  storage.setItem(CART_COUNT_KEY, '0');
  storage.removeItem(CART_CHECKOUT_KEY);
}

export function customerCartQuantity(cart: ShopifyCart) {
  return cart.lines.nodes
    .filter(line => !line.merchandise.product.handle.startsWith('delivery-slot-'))
    .reduce((sum, line) => sum + line.quantity, 0);
}

export function markCartCheckout(storage: CartStorage, cartId: string) {
  storage.setItem(CART_CHECKOUT_KEY, cartId);
}

export async function loadStoredCart(storage: CartStorage, fetcher: typeof fetch = fetch): Promise<ShopifyCart | null> {
  const id = storage.getItem(CART_ID_KEY);
  if (!id) {
    clearCartSession(storage);
    return null;
  }
  if (storage.getItem(CART_CHECKOUT_KEY) === id) storage.removeItem(CART_CHECKOUT_KEY);
  const response = await fetcher(`/api/cart?id=${encodeURIComponent(id)}`);
  const result = await response.json() as { cart?: ShopifyCart; code?: unknown; error?: string } | null;
  if (isMissingCartResponse(response, result)) {
    if (storage.getItem(CART_ID_KEY) === id) clearCartSession(storage);
    return null;
  }
  if (!response.ok) throw new Error(result?.error || 'Could not load the cart. Please try again.');
  if (!result?.cart) throw new Error('Could not load the cart. Please try again.');
  return result.cart;
}

// Claim the marker before awaiting: pageshow and visibilitychange can both fire
// on the same return. Errors keep the cached cart; the cart page offers a retry.
export async function refreshCartAfterCheckout(storage: CartStorage, fetcher: typeof fetch = fetch) {
  const id = storage.getItem(CART_CHECKOUT_KEY);
  if (!id) return undefined;
  storage.removeItem(CART_CHECKOUT_KEY);
  if (storage.getItem(CART_ID_KEY) !== id) return undefined;

  const cart = await loadStoredCart(storage, fetcher);
  // A different tab may have added a new cart while this request was pending.
  if (storage.getItem(CART_ID_KEY) !== (cart ? id : null)) return undefined;
  storage.setItem(CART_COUNT_KEY, String(cart ? customerCartQuantity(cart) : 0));
  return cart;
}
