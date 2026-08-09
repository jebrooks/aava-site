import { SHOPIFY_COLLECTION_HANDLE } from './config';
import { ShopifyApiError, storefrontGraphql } from './client';
import type { ShopifyCart, ShopifyProduct, ShopifyUserError } from './types';

const PRODUCT_FIELDS = `#graphql
  fragment ProductFields on Product {
    id
    handle
    title
    description
    descriptionHtml
    productType
    tags
    availableForSale
    featuredImage { url altText width height }
    images(first: 8) { nodes { url altText width height } }
    options { id name values }
    variants(first: 100) {
      nodes {
        id
        title
        availableForSale
        quantityAvailable
        requiresShipping
        selectedOptions { name value }
        price { amount currencyCode }
        compareAtPrice { amount currencyCode }
        image { url altText width height }
      }
    }
    servingCount: metafield(namespace: "custom", key: "serving_count") { value }
    ingredients: metafield(namespace: "custom", key: "ingredients") { value }
    allergens: metafield(namespace: "custom", key: "allergens") { value }
    dietaryLabels: metafield(namespace: "custom", key: "dietary_labels") { value }
    preparationHours: metafield(namespace: "custom", key: "preparation_hours") { value }
    legacyUrl: metafield(namespace: "migration", key: "legacy_url") { value }
  }
`;

const CART_FIELDS = `#graphql
  fragment CartFields on Cart {
    id
    checkoutUrl
    totalQuantity
    attributes { key value }
    cost {
      subtotalAmount { amount currencyCode }
      totalAmount { amount currencyCode }
    }
    lines(first: 100) {
      nodes {
        id
        quantity
        attributes { key value }
        cost { totalAmount { amount currencyCode } }
        merchandise {
          ... on ProductVariant {
            id
            title
            availableForSale
            quantityAvailable
            requiresShipping
            selectedOptions { name value }
            price { amount currencyCode }
            compareAtPrice { amount currencyCode }
            image { url altText width height }
            product { handle title }
          }
        }
      }
    }
  }
`;

export async function listCharcuterieProducts(pageSize = 50) {
  const products: ShopifyProduct[] = [];
  let collectionDetails: { title: string; description: string } | null = null;
  let after: string | null = null;
  const first = Math.min(Math.max(pageSize, 1), 250);

  do {
    const data: {
      collection: {
        title: string;
        description: string;
        products: {
          nodes: ShopifyProduct[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      } | null;
    } = await storefrontGraphql(
      `${PRODUCT_FIELDS}
      query CharcuterieCollection($handle: String!, $first: Int!, $after: String) {
        collection(handle: $handle) {
          title
          description
          products(first: $first, after: $after, sortKey: MANUAL) {
            nodes { ...ProductFields }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { handle: SHOPIFY_COLLECTION_HANDLE, first, after },
    );

    if (!data.collection) {
      throw new ShopifyApiError(
        `Shopify collection “${SHOPIFY_COLLECTION_HANDLE}” was not found.`,
        404,
      );
    }

    collectionDetails ||= {
      title: data.collection.title,
      description: data.collection.description,
    };
    products.push(...data.collection.products.nodes);
    after = data.collection.products.pageInfo.hasNextPage
      ? data.collection.products.pageInfo.endCursor
      : null;
    if (data.collection.products.pageInfo.hasNextPage && !after) {
      throw new ShopifyApiError('Shopify did not return a cursor for the next catalog page.');
    }
  } while (after);

  return { ...collectionDetails!, products: { nodes: products } };
}

export async function getProductByHandle(handle: string) {
  const data = await storefrontGraphql<{ product: ShopifyProduct | null }>(
    `${PRODUCT_FIELDS}
    query ProductByHandle($handle: String!) {
      product(handle: $handle) { ...ProductFields }
    }`,
    { handle },
  );

  return data.product;
}

export async function assertCatalogVariant(variantId: string) {
  const data = await storefrontGraphql<{
    node: {
      id: string;
      availableForSale: boolean;
      product: {
        tags: string[];
        collections: { nodes: Array<{ handle: string }> };
      };
    } | null;
  }>(
    `#graphql
    query CatalogVariant($id: ID!) {
      node(id: $id) {
        ... on ProductVariant {
          id
          availableForSale
          product { tags collections(first: 20) { nodes { handle } } }
        }
      }
    }`,
    { id: variantId },
  );
  const product = data.node?.product;
  const isCatalogProduct = product?.collections.nodes.some(
    (collection) => collection.handle === SHOPIFY_COLLECTION_HANDLE,
  );
  if (!data.node || !product || !isCatalogProduct || product.tags.includes('delivery-slot')) {
    throw new ShopifyApiError('That item is not part of the public charcuterie catalog.', 400);
  }
  if (!data.node.availableForSale) {
    throw new ShopifyApiError('That item is currently unavailable.', 409);
  }
  return data.node;
}

interface CartPayload {
  cart: ShopifyCart | null;
  userErrors: ShopifyUserError[];
  warnings?: Array<{ message: string }>;
}

function checkedCart(payload: CartPayload) {
  if (payload.userErrors.length) {
    throw new ShopifyApiError(payload.userErrors.map((error) => error.message).join('; '), 400);
  }

  if (!payload.cart) {
    throw new ShopifyApiError('Shopify did not return a cart.');
  }

  return payload.cart;
}

export async function getCart(id: string) {
  const data = await storefrontGraphql<{ cart: ShopifyCart | null }>(
    `${CART_FIELDS}
    query Cart($id: ID!) { cart(id: $id) { ...CartFields } }`,
    { id },
  );

  return data.cart;
}

export async function createCart(merchandiseId: string, quantity: number) {
  const data = await storefrontGraphql<{ cartCreate: CartPayload }>(
    `${CART_FIELDS}
    mutation CreateCart($input: CartInput!) {
      cartCreate(input: $input) {
        cart { ...CartFields }
        userErrors { field message code }
        warnings { message }
      }
    }`,
    { input: { lines: [{ merchandiseId, quantity }] } },
  );

  return checkedCart(data.cartCreate);
}

export async function addCartLine(id: string, merchandiseId: string, quantity: number) {
  const data = await storefrontGraphql<{ cartLinesAdd: CartPayload }>(
    `${CART_FIELDS}
    mutation AddCartLine($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart { ...CartFields }
        userErrors { field message code }
        warnings { message }
      }
    }`,
    { cartId: id, lines: [{ merchandiseId, quantity }] },
  );

  return checkedCart(data.cartLinesAdd);
}

export async function updateCartLine(id: string, lineId: string, quantity: number) {
  const data = await storefrontGraphql<{ cartLinesUpdate: CartPayload }>(
    `${CART_FIELDS}
    mutation UpdateCartLine($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
      cartLinesUpdate(cartId: $cartId, lines: $lines) {
        cart { ...CartFields }
        userErrors { field message code }
        warnings { message }
      }
    }`,
    { cartId: id, lines: [{ id: lineId, quantity }] },
  );

  return checkedCart(data.cartLinesUpdate);
}

export async function removeCartLines(id: string, lineIds: string[]) {
  const data = await storefrontGraphql<{ cartLinesRemove: CartPayload }>(
    `${CART_FIELDS}
    mutation RemoveCartLines($cartId: ID!, $lineIds: [ID!]!) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
        cart { ...CartFields }
        userErrors { field message code }
        warnings { message }
      }
    }`,
    { cartId: id, lineIds },
  );

  return checkedCart(data.cartLinesRemove);
}

export async function updateCartAttributes(
  id: string,
  attributes: Array<{ key: string; value: string }>,
) {
  const data = await storefrontGraphql<{ cartAttributesUpdate: CartPayload }>(
    `${CART_FIELDS}
    mutation UpdateCartAttributes($cartId: ID!, $attributes: [AttributeInput!]!) {
      cartAttributesUpdate(cartId: $cartId, attributes: $attributes) {
        cart { ...CartFields }
        userErrors { field message code }
        warnings { message }
      }
    }`,
    { cartId: id, attributes },
  );

  return checkedCart(data.cartAttributesUpdate);
}

export async function replaceDeliverySlot(
  id: string,
  previousSlotLineIds: string[],
  slotVariantId: string,
  attributes: Array<{ key: string; value: string }>,
) {
  let cart = previousSlotLineIds.length ? await removeCartLines(id, previousSlotLineIds) : null;
  cart = await addCartLine(id, slotVariantId, 1);
  return updateCartAttributes(cart.id, attributes);
}

export function formatMoney(amount: { amount: string; currencyCode: string }) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: amount.currencyCode,
  }).format(Number(amount.amount));
}
