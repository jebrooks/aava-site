import type { LineAttribute } from './board-customization';
import type { ShopifyCart } from './shopify/types';
import { servingAttributes } from './serving-size.ts';

// Copy older carts to add Shopify-sourced serving details without changing an open checkout.
export function cartCopyWithServingCounts(cart: ShopifyCart) {
  let changed = false;
  const lines = cart.lines.nodes.map(line => {
    const serving = servingAttributes(line.merchandise.product, line.merchandise);
    if (line.merchandise.product.isGiftCard ||
      line.merchandise.product.handle.startsWith('delivery-slot-')) {
      return { merchandiseId: line.merchandise.id, quantity: line.quantity, attributes: line.attributes };
    }
    const existing = line.attributes.filter(attribute => attribute.key === 'Serves');
    if (JSON.stringify(existing) !== JSON.stringify(serving)) changed = true;
    return { merchandiseId: line.merchandise.id, quantity: line.quantity,
      attributes: [...line.attributes.filter(attribute => attribute.key !== 'Serves'), ...serving] };
  });
  return changed ? {
    attributes: cart.attributes.filter(attribute => attribute.key !== 'Checkout locked'), lines,
  } : null;
}

const deliveryAttributes = new Set([
  'Delivery ZIP', 'Delivery date', 'Delivery window', 'Delivery slot key', 'Delivery timezone',
]);

// A leftover capacity line would make a digital-only order require shipping in Shopify.
// Copy instead of changing a checkout that a customer may already have open.
export function cartCopyWithoutUnusedDelivery(cart: ShopifyCart) {
  const isDelivery = (line: ShopifyCart['lines']['nodes'][number]) =>
    line.merchandise.product.handle.startsWith('delivery-slot-');
  if (cart.lines.nodes.some(line => !isDelivery(line) && line.merchandise.requiresShipping)) return null;
  if (!cart.lines.nodes.some(isDelivery) && !cart.attributes.some(attribute => deliveryAttributes.has(attribute.key))) return null;
  return {
    attributes: cart.attributes.filter(attribute => attribute.key !== 'Checkout locked' && !deliveryAttributes.has(attribute.key)),
    lines: cart.lines.nodes.filter(line => !isDelivery(line)).map(line => ({
      merchandiseId: line.merchandise.id, quantity: line.quantity, attributes: line.attributes,
    })),
  };
}

// Keep the validated checkout untouched when a shopper returns to edit their cart.
export function cartCopyWithLineChange(cart: ShopifyCart, lineId: string, quantity: number) {
  if (!cart.lines.nodes.some(line => line.id === lineId)) throw new Error('Cart line not found.');
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 50) throw new Error('Invalid quantity.');
  return {
    attributes: cart.attributes.filter(attribute => attribute.key !== 'Checkout locked'),
    lines: cart.lines.nodes.flatMap(line => {
      const amount = line.id === lineId ? quantity : line.quantity;
      return amount ? [{ merchandiseId: line.merchandise.id, quantity: amount, attributes: line.attributes }] : [];
    }),
  };
}

export function cartCopyWithAddedLine(cart: ShopifyCart, merchandiseId: string, quantity: number, attributes: LineAttribute[] = []) {
  return {
    attributes: cart.attributes.filter(attribute => attribute.key !== 'Checkout locked'),
    lines: [
      ...cart.lines.nodes.map(line => ({ merchandiseId: line.merchandise.id, quantity: line.quantity, attributes: line.attributes })),
      { merchandiseId, quantity, attributes },
    ],
  };
}
