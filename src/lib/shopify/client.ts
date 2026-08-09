import { getAdminConfig, getStorefrontConfig, SHOPIFY_API_VERSION } from './config';

interface GraphqlEnvelope<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface AdminTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

let cachedAdminToken: { accessToken: string; expiresAt: number } | null = null;
let pendingAdminToken: Promise<string> | null = null;

export class ShopifyApiError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = 'ShopifyApiError';
  }
}

async function graphqlRequest<T>(
  url: string,
  accessTokenHeader: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [accessTokenHeader]: accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await response.json().catch(() => null)) as GraphqlEnvelope<T> | null;
  if (!response.ok) {
    throw new ShopifyApiError(`Shopify returned HTTP ${response.status}.`, response.status);
  }

  if (!payload?.data || payload.errors?.length) {
    const message = payload?.errors?.map((error) => error.message).join('; ');
    throw new ShopifyApiError(message || 'Shopify returned an invalid GraphQL response.');
  }

  return payload.data;
}

export function storefrontGraphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const config = getStorefrontConfig();
  if (!config) {
    throw new ShopifyApiError('The Shopify Storefront API is not configured.', 503);
  }

  return graphqlRequest<T>(
    `https://${config.storeDomain}/api/${SHOPIFY_API_VERSION}/graphql.json`,
    'X-Shopify-Storefront-Access-Token',
    config.accessToken,
    query,
    variables,
  );
}

async function exchangeAdminToken(config: NonNullable<ReturnType<typeof getAdminConfig>>) {
  const response = await fetch(
    `https://${config.storeDomain}/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    },
  );
  const payload = (await response.json().catch(() => null)) as AdminTokenResponse | null;
  if (!response.ok || !payload?.access_token) {
    throw new ShopifyApiError(
      payload?.error_description || payload?.error ||
        `Shopify Admin authentication returned HTTP ${response.status}.`,
      response.status || 502,
    );
  }

  // Refresh one minute before Shopify's 24-hour token actually expires.
  cachedAdminToken = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 86_399) - 60) * 1_000,
  };
  return cachedAdminToken.accessToken;
}

async function getAdminAccessToken(config: NonNullable<ReturnType<typeof getAdminConfig>>) {
  if (config.clientId && config.clientSecret) {
    if (cachedAdminToken && cachedAdminToken.expiresAt > Date.now()) {
      return cachedAdminToken.accessToken;
    }
    pendingAdminToken ||= exchangeAdminToken(config).finally(() => {
      pendingAdminToken = null;
    });
    return pendingAdminToken;
  }
  return config.accessToken;
}

export async function adminGraphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const config = getAdminConfig();
  if (!config) {
    throw new ShopifyApiError('The Shopify Admin API is not configured.', 503);
  }

  const request = async () =>
    graphqlRequest<T>(
      `https://${config.storeDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      'X-Shopify-Access-Token',
      await getAdminAccessToken(config),
      query,
      variables,
    );

  try {
    return await request();
  } catch (error) {
    if (
      error instanceof ShopifyApiError &&
      error.status === 401 &&
      config.clientId &&
      config.clientSecret
    ) {
      cachedAdminToken = null;
      return request();
    }
    throw error;
  }
}
