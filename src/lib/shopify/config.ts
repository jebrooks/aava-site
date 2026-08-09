const stripProtocol = (value: string) =>
  value.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');

export const SHOPIFY_API_VERSION = import.meta.env.SHOPIFY_API_VERSION || '2026-07';
export const SHOPIFY_COLLECTION_HANDLE =
  import.meta.env.SHOPIFY_CHARCUTERIE_COLLECTION_HANDLE || 'charcuterie';

export function getStorefrontConfig() {
  const storeDomain = stripProtocol(import.meta.env.PUBLIC_SHOPIFY_STORE_DOMAIN || '');
  const accessToken = import.meta.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || '';

  return storeDomain && accessToken ? { storeDomain, accessToken } : null;
}

export function getAdminConfig() {
  const storeDomain = stripProtocol(import.meta.env.PUBLIC_SHOPIFY_STORE_DOMAIN || '');
  const accessToken = import.meta.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '';
  const clientId = import.meta.env.SHOPIFY_CLIENT_ID || '';
  const clientSecret = import.meta.env.SHOPIFY_CLIENT_SECRET || '';

  return storeDomain && ((clientId && clientSecret) || accessToken)
    ? { storeDomain, accessToken, clientId, clientSecret }
    : null;
}

export function isShopifyConfigured() {
  return getStorefrontConfig() !== null;
}
