import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { cartCopyWithDeliveryWindow } from '../src/lib/cart-edit.ts';

test('normal cart rejects physical On tour variants through the real catalog and checkout guards', async t => {
  const variant = {
    id: 'gid://shopify/ProductVariant/124', availableForSale: true, requiresShipping: true,
    selectedOptions: [{ name: 'Fulfillment', value: 'On tour' }],
    product: { handle: 'regular-board', title: 'Board', isGiftCard: false, tags: ['charcuterie'],
      collections: { nodes: [{ handle: 'charcuterie' }] } },
  };
  const state = { mutations: 0, queries: 0, variant, cart: {
    id: 'gid://shopify/Cart/forged-tour', checkoutUrl: 'https://example.com/checkout', attributes: [],
    lines: { nodes: [{ id: 'physical-tour-line', quantity: 1, merchandise: variant, attributes: [] }] },
  } };
  const original = structuredClone(state.cart);
  globalThis.__physicalTourCart = state;
  const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] }, plugins: [{ name: 'physical-tour-cart-transport', enforce: 'pre',
      resolveId(id, importer) {
        if (id === './client' && importer?.endsWith('/src/lib/shopify/storefront.ts')) return '\0physical-tour-client';
      },
      load(id) {
        if (id === '\0physical-tour-client') return `
          export { ShopifyApiError } from '/src/lib/shopify/client.ts';
          export async function storefrontGraphql(query) {
            const s=globalThis.__physicalTourCart;
            if (/\\bmutation\\b/.test(query)) { s.mutations++; throw new Error('Cart writes are forbidden in this rejection test'); }
            s.queries++;
            if (query.includes('query CatalogVariant')) return { node: s.variant };
            if (query.includes('query Cart(')) return { cart: s.cart };
            throw new Error('Unexpected read');
          }
        `;
      },
    }] });
  t.after(async () => { await server.close(); delete globalThis.__physicalTourCart; });
  const { POST } = await server.ssrLoadModule('/src/pages/api/cart.ts');
  const post = async body => {
    const response = await POST({ request: new Request('http://localhost/api/cart', { method: 'POST',
      headers: { origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const added = await post({ action: 'add', merchandiseId: variant.id, quantity: 1 });
  assert.equal(added.status, 400);
  assert.match(added.body.error, /not part of the public charcuterie catalog/);
  const checkout = await post({ action: 'checkout', cartId: state.cart.id });
  assert.equal(checkout.status, 400);
  assert.match(checkout.body.error, /On-tour boards must be booked with a tour/);
  assert.equal(state.queries, 2, 'Both real guard paths must inspect the supplied merchandise');
  assert.equal(state.mutations, 0, 'Neither forged add nor checkout can mutate the normal cart');
  assert.deepEqual(state.cart, original);
});

test('cart selection and checkout use metadata, migrate old reservations, and revalidate blackouts', async t => {
  const state = { blocked: false, validations: 0, copies: 0 };
  const board = { id: 'gid://shopify/ProductVariant/board', requiresShipping: true, product: { handle: 'board', title: 'Board', isGiftCard: false } };
  const gift = { id: 'gid://shopify/ProductVariant/gift', requiresShipping: false, product: { handle: 'gift', isGiftCard: true } };
  state.cart = { id: 'gid://shopify/Cart/old', checkoutUrl: 'https://example.com/checkout', attributes: [{ key: 'Checkout locked', value: 'true' }, {key:'Note',value:'Keep'}], lines: {nodes:[
    {id:'board',quantity:2,merchandise:board,attributes:[{key:'Cheeses',value:'Brie'}]},
    {id:'gift',quantity:1,merchandise:gift,attributes:[]},
    {id:'legacy',quantity:1,merchandise:{id:'gid://shopify/ProductVariant/slot',requiresShipping:true,product:{handle:'delivery-slot-2026-12-02'}},attributes:[]},
  ]}};
  state.ensure = async (cart, slot, delivery) => {
    const input = cartCopyWithDeliveryWindow(cart, slot, delivery);
    if (!input) return cart;
    state.copies++;
    state.cart = { ...cart, id:'gid://shopify/Cart/new', attributes:input.attributes, lines:{nodes:input.lines.map((line,i)=>({id:'line'+i,quantity:line.quantity,attributes:line.attributes,merchandise:line.merchandiseId===board.id?board:gift}))}};
    return state.cart;
  };
  globalThis.__deliveryCart = state;
  const server = await createServer({configFile:false,server:{middlewareMode:true,watch:null,ws:false},optimizeDeps:{noDiscovery:true,include:[]},plugins:[{name:'cart-fixture',enforce:'pre',resolveId(id){
    if(id==='../../lib/shopify/storefront')return '\0cart-storefront';
    if(id==='../../lib/shopify/schedule')return '\0cart-schedule';
  },load(id){
    if(id==='\0cart-schedule')return `import {ShopifyApiError} from '/src/lib/shopify/client.ts'; export async function assertDeliverySlotAvailable(zip,key){const s=globalThis.__deliveryCart;s.validations++;if(s.blocked)throw new ShopifyApiError('That delivery window is no longer available.',409);if(zip!=='22205'||key!=='2026-12-02:13:00')throw new Error('Invalid selection');return {key,date:'2026-12-02',label:'1–3 PM'};}`;
    if(id==='\0cart-storefront')return `
      const s=globalThis.__deliveryCart;
      export const getCart=async()=>s.cart;
      export const ensureCartDeliveryWindow=(...args)=>s.ensure(...args);
      export const ensureCartServingCounts=async cart=>cart;
      export const removeUnusedDelivery=async cart=>cart;
      export const updateCartAttributes=async(id,attributes)=>(s.cart={...s.cart,attributes});
      export const addCartLine=()=>{throw new Error('Must not add reservation inventory')};
      export const assertCatalogVariant=()=>{};
      export const createCart=()=>{};
      export const removeCartLines=()=>{};
      export const copyCartWithLineChange=()=>{};
      export const copyCartWithAddedLine=()=>{};
      export const updateCartLine=()=>{};
    `;
  }}]});
  t.after(async()=>{await server.close();delete globalThis.__deliveryCart;});
  const {POST}=await server.ssrLoadModule('/src/pages/api/cart.ts');
  const post=async body=>{
    const response=await POST({request:new Request('http://localhost/api/cart',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({cartId:state.cart.id,...body})})});
    return {status:response.status,body:await response.json()};
  };
  const original=structuredClone(state.cart);
  const selected=await post({action:'setDelivery',zip:'22205',slotKey:'2026-12-02:13:00'});
  assert.equal(selected.status,200);
  assert.equal(state.cart.lines.nodes.length,2);
  assert.ok(state.cart.lines.nodes[0].attributes.some(a=>a.key==='Delivery date'&&a.value==='2026-12-02'));
  assert.deepEqual(state.cart.lines.nodes[1].attributes,[]);
  assert.ok(state.cart.attributes.some(a=>a.key==='Note'));
  assert.equal(original.lines.nodes.length,3);
  const checkout=await post({action:'checkout'});
  assert.equal(checkout.status,200);
  assert.equal(checkout.body.checkoutUrl,'https://example.com/checkout');
  assert.equal(state.validations,2);
  assert.equal(state.copies,1,'Unchanged delivery details reuse the checkout');
  state.blocked=true;
  const rejected=await post({action:'checkout'});
  assert.notEqual(rejected.status,200);
  assert.match(rejected.body.error,/no longer available/);
  assert.equal(state.validations,3);
});
