import { existsSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

if (existsSync('.env')) process.loadEnvFile('.env');

const DEFAULT_PAGE_URL = 'http://127.0.0.1:4330/charcuterie-menu';
const PAGE_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 1_000;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function storeDomain(value) {
  return value.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

async function storefrontGraphql(query, variables) {
  const domain = storeDomain(requiredEnvironment('PUBLIC_SHOPIFY_STORE_DOMAIN'));
  const accessToken = requiredEnvironment('SHOPIFY_STOREFRONT_ACCESS_TOKEN');
  const apiVersion = process.env.SHOPIFY_API_VERSION?.trim() || '2026-07';
  const response = await fetch(`https://${domain}/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });

  const responseText = await response.text();
  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error(`Shopify returned a non-JSON response (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(`Shopify returned HTTP ${response.status}.`);
  }
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join('; '));
  }
  if (!payload.data) {
    throw new Error('Shopify returned a GraphQL response without data.');
  }
  return payload.data;
}

async function listShopifyProductHandles() {
  const collectionHandle =
    process.env.SHOPIFY_CHARCUTERIE_COLLECTION_HANDLE?.trim() || 'charcuterie';
  const query = `#graphql
    query CatalogParity($handle: String!, $after: String) {
      collection(handle: $handle) {
        products(first: 100, after: $after, sortKey: MANUAL) {
          nodes { handle }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  `;

  const handles = [];
  let after = null;
  do {
    const data = await storefrontGraphql(query, { handle: collectionHandle, after });
    if (!data.collection) {
      throw new Error(`Shopify collection “${collectionHandle}” was not found.`);
    }

    const products = data.collection.products;
    handles.push(...products.nodes.map((product) => product.handle));
    after = products.pageInfo.hasNextPage ? products.pageInfo.endCursor : null;
    if (products.pageInfo.hasNextPage && !after) {
      throw new Error('Shopify did not return a cursor for the next catalog page.');
    }
  } while (after);

  if (!handles.length) {
    throw new Error(`Shopify collection “${collectionHandle}” has no Storefront-visible products.`);
  }
  return handles;
}

function isLoopback(url) {
  return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
}

async function isPortOpen(url) {
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: url.hostname, port });
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(1_000);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function startLocalServer() {
  const astroCli = fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url));
  const server = spawn(process.execPath, [astroCli, 'dev'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const capture = (chunk) => {
    output = `${output}${chunk}`.slice(-8_000);
  };
  server.stdout.on('data', capture);
  server.stderr.on('data', capture);
  server.getCapturedOutput = () => output;
  return server;
}

async function fetchRenderedCatalog(pageUrl, server) {
  const deadline = Date.now() + PAGE_TIMEOUT_MS;
  let lastError = 'The page did not respond.';

  while (Date.now() < deadline) {
    if (server && server.exitCode !== null && server.exitCode !== 0) {
      throw new Error(`The Astro server exited before the check ran.\n${server.getCapturedOutput()}`);
    }

    try {
      const response = await fetch(pageUrl, { signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response.text();
      lastError = `The catalog returned HTTP ${response.status}.`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(POLL_INTERVAL_MS);
  }

  const serverOutput = server?.getCapturedOutput();
  throw new Error(`${lastError}${serverOutput ? `\n${serverOutput}` : ''}`);
}

function renderedProductHandles(html) {
  return Array.from(html.matchAll(/data-product-handle="([a-z0-9-]+)"/g), (match) => match[1]);
}

function compareCatalogs(shopifyHandles, renderedHandles) {
  const shopifySet = new Set(shopifyHandles);
  const renderedSet = new Set(renderedHandles);
  const missing = shopifyHandles.filter((handle) => !renderedSet.has(handle));
  const unexpected = renderedHandles.filter((handle) => !shopifySet.has(handle));
  const duplicateShopifyHandles = shopifyHandles.length !== shopifySet.size;
  const duplicateRenderedHandles = renderedHandles.length !== renderedSet.size;

  if (
    shopifyHandles.length !== renderedHandles.length ||
    missing.length ||
    unexpected.length ||
    duplicateShopifyHandles ||
    duplicateRenderedHandles
  ) {
    const details = [
      `Shopify products: ${shopifyHandles.length}`,
      `Rendered products: ${renderedHandles.length}`,
    ];
    if (missing.length) details.push(`Missing from page: ${missing.join(', ')}`);
    if (unexpected.length) details.push(`Unexpected on page: ${unexpected.join(', ')}`);
    if (duplicateShopifyHandles) details.push('Shopify returned duplicate product handles.');
    if (duplicateRenderedHandles) details.push('The page rendered duplicate product handles.');
    throw new Error(details.join('\n'));
  }
}

async function stopServer(server) {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([once(server, 'exit'), delay(5_000)]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

async function writeSummary(message) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Catalog parity\n\n${message}\n`);
}

async function main() {
  const pageUrl = new URL(process.env.CATALOG_PAGE_URL || DEFAULT_PAGE_URL);
  let server;

  try {
    const shopifyHandles = await listShopifyProductHandles();
    if (isLoopback(pageUrl) && !(await isPortOpen(pageUrl))) {
      server = startLocalServer();
    }

    const html = await fetchRenderedCatalog(pageUrl, server);
    const renderedHandles = renderedProductHandles(html);
    compareCatalogs(shopifyHandles, renderedHandles);

    const message = `✅ Shopify and the rendered catalog contain the same ${shopifyHandles.length} products.`;
    console.log(message);
    await writeSummary(message);
  } finally {
    await stopServer(server);
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Catalog parity check failed:\n${message}`);
  await writeSummary(`❌ ${message.replaceAll('\n', '<br>')}`);
  process.exitCode = 1;
});
