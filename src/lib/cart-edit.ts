import type { ShopifyCart } from './shopify/types';

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
