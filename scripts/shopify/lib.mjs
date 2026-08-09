export const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-07';

let cachedAdminToken;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function shopifyEnvironment() {
  return {
    store: required('PUBLIC_SHOPIFY_STORE_DOMAIN').replace(/^https?:\/\//, '').replace(/\/$/, ''),
    token: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim() || '',
    clientId: process.env.SHOPIFY_CLIENT_ID?.trim() || '',
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET?.trim() || '',
  };
}

async function adminAccessToken(environment) {
  if (environment.clientId && environment.clientSecret) {
    if (cachedAdminToken?.expiresAt > Date.now()) return cachedAdminToken.value;
    const response = await fetch(`https://${environment.store}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: environment.clientId,
        client_secret: environment.clientSecret,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.access_token) {
      throw new Error(
        payload?.error_description || payload?.error ||
          `Shopify Admin authentication returned HTTP ${response.status}.`,
      );
    }
    cachedAdminToken = {
      value: payload.access_token,
      expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 86_399) - 60) * 1_000,
    };
    return cachedAdminToken.value;
  }
  if (environment.token) return environment.token;
  throw new Error(
    'SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET (or legacy SHOPIFY_ADMIN_ACCESS_TOKEN) are required.',
  );
}

export async function adminGraphql(query, variables = {}) {
  const environment = shopifyEnvironment();
  const token = await adminAccessToken(environment);
  const response = await fetch(`https://${environment.store}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  const result = await response.json();
  if (!response.ok || result.errors?.length) {
    throw new Error(result.errors?.map((error) => error.message).join('; ') || `Shopify HTTP ${response.status}`);
  }
  return result.data;
}

export function assertUserErrors(payload, operation) {
  if (payload.userErrors?.length) {
    throw new Error(`${operation}: ${payload.userErrors.map((error) => error.message).join('; ')}`);
  }
}

export async function publishResource(id) {
  const publicationId = process.env.SHOPIFY_STOREFRONT_PUBLICATION_ID;
  if (!publicationId) throw new Error('SHOPIFY_STOREFRONT_PUBLICATION_ID is required.');
  const data = await adminGraphql(
    `mutation Publish($id: ID!, $publicationId: ID!) {
      publishablePublish(id: $id, input: [{ publicationId: $publicationId }]) {
        userErrors { field message }
      }
    }`,
    { id, publicationId },
  );
  assertUserErrors(data.publishablePublish, 'Publishing resource');
}
