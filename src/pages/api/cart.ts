import type { APIRoute } from 'astro';
import { apiError, assertSameOrigin, json, readJson } from '../../lib/http';
import { ShopifyApiError } from '../../lib/shopify/client';
import { assertDeliverySlotAvailable } from '../../lib/shopify/schedule';
import {
  addCartLine,
  assertCatalogVariant,
  createCart,
  getCart,
  removeCartLines,
  replaceDeliverySlot,
  updateCartAttributes,
  updateCartLine,
} from '../../lib/shopify/storefront';

export const prerender = false;

function publicCart<T extends { checkoutUrl: string }>(cart: T) {
  return { ...cart, checkoutUrl: '' };
}

function isCheckoutLocked(cart: { attributes: Array<{ key: string; value: string }> }) {
  return cart.attributes.some(
    (attribute) => attribute.key === 'Checkout locked' && attribute.value === 'true',
  );
}

function id(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.startsWith('gid://shopify/')) {
    throw new ShopifyApiError(`${name} is invalid.`, 400);
  }
  return value;
}

function quantity(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 50) {
    throw new ShopifyApiError('Quantity must be between 0 and 50.', 400);
  }
  return parsed;
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const cartId = id(url.searchParams.get('id'), 'Cart ID');
    const cart = await getCart(cartId);
    if (!cart) return json({ error: 'Cart not found.' }, { status: 404 });
    return json({ cart: publicCart(cart) });
  } catch (error) {
    return apiError(error);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    const body = await readJson<Record<string, unknown>>(request);
    const action = body.action;

    if (action === 'add') {
      const merchandiseId = id(body.merchandiseId, 'Variant ID');
      const amount = quantity(body.quantity || 1);
      await assertCatalogVariant(merchandiseId);
      const suppliedCartId = typeof body.cartId === 'string' ? body.cartId : '';
      const current = suppliedCartId ? await getCart(id(suppliedCartId, 'Cart ID')) : null;
      const cart = current && !isCheckoutLocked(current)
        ? await addCartLine(current.id, merchandiseId, amount)
        : await createCart(merchandiseId, amount);
      return json({ cart: publicCart(cart) });
    }

    if (action === 'update') {
      const cartId = id(body.cartId, 'Cart ID');
      const lineId = id(body.lineId, 'Line ID');
      const amount = quantity(body.quantity);
      const current = await getCart(cartId);
      if (current && isCheckoutLocked(current)) {
        throw new ShopifyApiError('This cart is already in checkout. Start a new cart to make changes.', 409);
      }
      const line = current?.lines.nodes.find((candidate) => candidate.id === lineId);
      if (!line) throw new ShopifyApiError('Cart line not found.', 404);
      if (line.merchandise.product.handle.startsWith('delivery-slot-')) {
        throw new ShopifyApiError('Choose delivery through the delivery scheduler.', 400);
      }
      const cart = amount
        ? await updateCartLine(cartId, lineId, amount)
        : await removeCartLines(cartId, [lineId]);
      return json({ cart: publicCart(cart) });
    }

    if (action === 'remove') {
      const cartId = id(body.cartId, 'Cart ID');
      const lineId = id(body.lineId, 'Line ID');
      const current = await getCart(cartId);
      if (current && isCheckoutLocked(current)) {
        throw new ShopifyApiError('This cart is already in checkout. Start a new cart to make changes.', 409);
      }
      const line = current?.lines.nodes.find((candidate) => candidate.id === lineId);
      if (!line) throw new ShopifyApiError('Cart line not found.', 404);
      if (line.merchandise.product.handle.startsWith('delivery-slot-')) {
        throw new ShopifyApiError('Choose delivery through the delivery scheduler.', 400);
      }
      const cart = await removeCartLines(cartId, [lineId]);
      return json({ cart: publicCart(cart) });
    }

    if (action === 'setDelivery') {
      const cartId = id(body.cartId, 'Cart ID');
      const variantId = id(body.variantId, 'Delivery slot ID');
      const slotKey = String(body.slotKey || '');
      const zip = String(body.zip || '');
      const slot = await assertDeliverySlotAvailable(zip, variantId, slotKey);
      const current = await getCart(cartId);
      if (!current) throw new ShopifyApiError('Cart not found.', 404);
      if (isCheckoutLocked(current)) {
        throw new ShopifyApiError('This cart is already in checkout. Start a new cart to make changes.', 409);
      }
      if (!current.lines.nodes.some((line) =>
        !line.merchandise.product.handle.startsWith('delivery-slot-') && line.merchandise.requiresShipping
      )) {
        throw new ShopifyApiError('Add a physical charcuterie item before choosing delivery.', 400);
      }
      const existingSlotLines = current.lines.nodes
        .filter((line) => line.merchandise.product.handle.startsWith('delivery-slot-'))
        .map((line) => line.id);
      const cart = await replaceDeliverySlot(cartId, existingSlotLines, variantId, [
        { key: 'Delivery ZIP', value: zip },
        { key: 'Delivery date', value: slot.date },
        { key: 'Delivery window', value: slot.label },
        { key: 'Delivery slot key', value: slot.key },
        { key: 'Delivery timezone', value: 'America/New_York' },
      ]);
      return json({ cart: publicCart(cart) });
    }

    if (action === 'checkout') {
      const cart = await getCart(id(body.cartId, 'Cart ID'));
      if (!cart) throw new ShopifyApiError('Cart not found.', 404);
      const catalogLines = cart.lines.nodes.filter(
        (line) => !line.merchandise.product.handle.startsWith('delivery-slot-'),
      );
      if (!catalogLines.length) throw new ShopifyApiError('Add an item before checkout.', 400);
      const needsDelivery = catalogLines.some((line) => line.merchandise.requiresShipping);
      const slotLines = cart.lines.nodes.filter((line) =>
        line.merchandise.product.handle.startsWith('delivery-slot-')
      );
      if (needsDelivery) {
        if (slotLines.length !== 1 || slotLines[0].quantity !== 1) {
          throw new ShopifyApiError('Choose one delivery window before checkout.', 400);
        }
        const attributes = Object.fromEntries(
          cart.attributes.map((attribute) => [attribute.key, attribute.value]),
        );
        await assertDeliverySlotAvailable(
          attributes['Delivery ZIP'] || '',
          slotLines[0].merchandise.id,
          attributes['Delivery slot key'] || '',
        );
      }
      const lockedCart = isCheckoutLocked(cart)
        ? cart
        : await updateCartAttributes(cart.id, [
            ...cart.attributes.filter((attribute) => attribute.key !== 'Checkout locked'),
            { key: 'Checkout locked', value: 'true' },
          ]);
      return json({ checkoutUrl: lockedCart.checkoutUrl });
    }

    throw new ShopifyApiError('Unsupported cart action.', 400);
  } catch (error) {
    return apiError(error);
  }
};
