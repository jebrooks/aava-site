import { adminGraphql, assertUserErrors } from "./lib.mjs";
const callbackUrl = process.argv[2];
if (!callbackUrl || new URL(callbackUrl).protocol !== "https:")
  throw new Error(
    "Pass the HTTPS production /api/shopify/webhooks URL after deploying the storefront guards.",
  );
const topics = ["PRODUCTS_CREATE", "PRODUCTS_UPDATE", "COLLECTIONS_UPDATE"];
const existing = await adminGraphql(
  `query {webhookSubscriptions(first:100){nodes{topic endpoint{... on WebhookHttpEndpoint{callbackUrl}}}}}`,
);
for (const topic of topics) {
  if (
    existing.webhookSubscriptions.nodes.some(
      (w) => w.topic === topic && w.endpoint?.callbackUrl === callbackUrl,
    )
  )
    continue;
  const result = await adminGraphql(
    `mutation($topic:WebhookSubscriptionTopic!,$input:WebhookSubscriptionInput!){webhookSubscriptionCreate(topic:$topic,webhookSubscription:$input){webhookSubscription{id} userErrors{message}}}`,
    { topic, input: { callbackUrl, format: "JSON" } },
  );
  assertUserErrors(
    result.webhookSubscriptionCreate,
    "Registering tour-board sync webhook",
  );
}
console.log(
  "Product-change webhooks registered. Shopify signs app subscriptions using SHOPIFY_CLIENT_SECRET.",
);
