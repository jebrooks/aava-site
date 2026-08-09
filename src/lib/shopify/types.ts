export interface Money {
  amount: string;
  currencyCode: string;
}

export interface ShopifyImage {
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export interface SelectedOption {
  name: string;
  value: string;
}

export interface ProductVariant {
  id: string;
  title: string;
  availableForSale: boolean;
  quantityAvailable: number | null;
  requiresShipping: boolean;
  selectedOptions: SelectedOption[];
  price: Money;
  compareAtPrice: Money | null;
  image: ShopifyImage | null;
}

export interface ProductOption {
  id: string;
  name: string;
  values: string[];
}

export interface ProductMetafield {
  value: string;
}

export interface ShopifyProduct {
  id: string;
  handle: string;
  title: string;
  description: string;
  descriptionHtml: string;
  productType: string;
  tags: string[];
  availableForSale: boolean;
  featuredImage: ShopifyImage | null;
  images: { nodes: ShopifyImage[] };
  options: ProductOption[];
  variants: { nodes: ProductVariant[] };
  servingCount: ProductMetafield | null;
  ingredients: ProductMetafield | null;
  allergens: ProductMetafield | null;
  dietaryLabels: ProductMetafield | null;
  preparationHours: ProductMetafield | null;
  legacyUrl: ProductMetafield | null;
}

export interface CartLine {
  id: string;
  quantity: number;
  attributes: Array<{ key: string; value: string }>;
  cost: { totalAmount: Money };
  merchandise: ProductVariant & {
    product: Pick<ShopifyProduct, 'handle' | 'title'>;
  };
}

export interface ShopifyCart {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  attributes: Array<{ key: string; value: string }>;
  cost: {
    subtotalAmount: Money;
    totalAmount: Money;
  };
  lines: { nodes: CartLine[] };
}

export interface ShopifyUserError {
  field?: string[] | null;
  message: string;
  code?: string | null;
}

export interface DeliveryWindow {
  label: string;
  start: string;
  end: string;
}

export interface DeliveryScheduleConfig {
  timezone: 'America/New_York';
  eligibleZips: string[];
  dailyCapacity: number;
  leadTimeHours: number;
  horizonDays: number;
  blackoutDates: string[];
  weeklyWindows: Record<string, DeliveryWindow[]>;
}

export interface DeliverySlot {
  key: string;
  date: string;
  label: string;
  start: string;
  end: string;
  variantId: string;
  available: boolean;
}
