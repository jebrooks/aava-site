import { waitUntil } from '@vercel/functions';
import { adminGraphql } from '../../../lib/shopify/client';
import { syncTourBoardProduct,syncTourBoards } from '../../../lib/shopify/tour-board-sync';
import type { APIRoute } from 'astro';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { json } from '../../../lib/http';

export const prerender = false;
let canonicalShop:string|undefined;

function validSignature(body: string, signature: string, secret: string) {
  const expected = createHmac('sha256', secret).update(body, 'utf8').digest('base64');
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(signature);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

export const POST: APIRoute = async ({ request }) => {
  const secrets = [import.meta.env.SHOPIFY_WEBHOOK_SECRET, import.meta.env.SHOPIFY_CLIENT_SECRET].filter((value): value is string => !!value);
  const signature = request.headers.get('x-shopify-hmac-sha256') || '';
  const topic = request.headers.get('x-shopify-topic') || 'unknown';
  const shop = request.headers.get('x-shopify-shop-domain') || 'unknown';
  const body = await request.text();

  if (!secrets.length) return json({ error: 'Webhook verification is not configured.' }, { status: 503 });
  if (!signature || !secrets.some(secret => validSignature(body, signature, secret))) {
    return json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }

  const expectedShop=(import.meta.env.PUBLIC_SHOPIFY_STORE_DOMAIN||'').replace(/^https?:\/\//,'').replace(/\/$/,'');
  if(shop!==expectedShop){
    canonicalShop||=(await adminGraphql<{shop:{myshopifyDomain:string}}>('query WebhookShop{shop{myshopifyDomain}}')).shop.myshopifyDomain;
    if(shop!==canonicalShop)return json({error:'Unexpected Shopify store.'},{status:401});
  }
  if(['products/create','products/update'].includes(topic)){
    let payload:{admin_graphql_api_id?:string};
    try{payload=JSON.parse(body);}catch{return json({error:'Invalid webhook payload.'},{status:400});}
    const id=payload.admin_graphql_api_id;
    if(typeof id==='string'&&id.startsWith('gid://shopify/Product/')){
      // Own writes emit further product events. A no-change plan performs no writes, ending the cycle.
      waitUntil(syncTourBoardProduct(adminGraphql,id,import.meta.env.SHOPIFY_CHARCUTERIE_COLLECTION_HANDLE||'charcuterie')
        .catch(error=>console.error('Tour board webhook sync failed:',error instanceof Error?error.message:'Unknown error')));
    }
  }
  if(topic==='collections/update'){
    let payload:{handle?:string};
    try{payload=JSON.parse(body);}catch{return json({error:'Invalid webhook payload.'},{status:400});}
    const handle=import.meta.env.SHOPIFY_CHARCUTERIE_COLLECTION_HANDLE||'charcuterie';
    if(payload.handle===handle)waitUntil(syncTourBoards(adminGraphql,handle).catch(error=>console.error('Tour board collection sync failed:',error instanceof Error?error.message:'Unknown error')));
  }
  console.info(JSON.stringify({ event: 'shopify_webhook', topic, shop, receivedAt: new Date().toISOString() }));
  return json({ accepted: true });
};
