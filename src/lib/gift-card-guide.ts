import type { ShopifyProduct, Money } from './shopify/types.ts';
import { isTourVariant } from './tour-fulfillment.ts';
import { servingCount } from './serving-size.ts';

export interface GiftPriceRow {
  label: string;
  minimum: Money;
  maximum: Money;
  approximate: boolean;
}
export interface GiftTourPrices {
  seatPrice: string;
  busPrice: string;
  currencyCode: string;
  enabled: boolean;
}

export function giftCardPriceGuide(products: ShopifyProduct[], tours: GiftTourPrices | null): GiftPriceRow[] {
  const groups = new Map<number, Money[]>();
  for (const product of products) {
    if (product.isGiftCard || product.tags.includes('delivery-slot') || product.tags.includes('scheduled-tour')) continue;
    for (const variant of product.variants.nodes) {
      if (!variant.availableForSale || isTourVariant(variant)) continue;
      const count = servingCount(product, variant);
      const amount = Number(variant.price.amount);
      if (!count || ![4, 8, 10, 15].includes(count) || !Number.isFinite(amount) || amount <= 0) continue;
      groups.set(count, [...(groups.get(count) || []), variant.price]);
    }
  }
  const rows: GiftPriceRow[] = [];
  for (const count of [4, 8, 10, 15]) {
    const prices = groups.get(count);
    // Never combine amounts in different currencies into a single range.
    if (!prices?.length || prices.some(price => price.currencyCode !== prices[0].currencyCode)) continue;
    const min = Math.min(...prices.map(price => Number(price.amount)));
    const max = Math.max(...prices.map(price => Number(price.amount)));
    // Charcuterie guidance uses the range midpoint rounded to the nearest $25.
    const estimate = Math.max(25, Math.round(((min + max) / 2) / 25) * 25);
    const money = (amount: number): Money => ({ amount: amount.toFixed(2), currencyCode: prices[0].currencyCode });
    rows.push({ label: `Charcuterie — serves ${count}`, minimum: money(estimate),
      maximum: money(estimate), approximate: true });
  }
  if (tours?.enabled) {
    for (const [label, amount] of [
      ['Public wine tour — per person', tours.seatPrice],
      ['Private wine tour — up to 10 people', tours.busPrice],
    ]) {
      if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) continue;
      const money = { amount, currencyCode: tours.currencyCode };
      rows.push({ label, minimum: money, maximum: money, approximate: false });
    }
  }
  return rows;
}
