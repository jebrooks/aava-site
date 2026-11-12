import test from 'node:test';
import assert from 'node:assert/strict';
import { syncTourCatalog } from '../src/lib/shopify/tours.ts';
const now = new Date('2026-11-11T20:00:00Z');
function fixture() {
  const state = {
    fields: {enabled:'true',minimum_days:'3',months_ahead:'1',operating_days:'["Sunday"]',blackout_dates:'',seat_price:'125.00',bus_price:'1250.00'},
    products:[], lock:null, calls:[], failBundle:false, failPublish:false,
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  const ok = key => ({[key]:{userErrors:[]}});
  const graphql = async (query, v={}) => {
    state.calls.push(query);
    if (query.includes('query TourSchedule')) return {metaobjectByHandle:{fields:Object.entries(state.fields).map(([key,value])=>({key,value}))}};
    if (query.includes('query TourSyncLock')) return {shop:{id:'shop',metafield:clone(state.lock)}};
    if (query.includes('mutation TourSyncLock')) {
      const input=v.input[0];
      if (input.compareDigest!==(state.lock?.compareDigest??null)) return {metafieldsSet:{userErrors:[{code:'STALE_OBJECT',message:'stale'}]}};
      state.lock={value:input.value,compareDigest:Math.random().toString()};
      return ok('metafieldsSet');
    }
    if (query.includes('query TourProducts')) return {products:{nodes:clone(state.products),pageInfo:{hasNextPage:false,endCursor:null}}};
    if (query.includes('query TourByHandle')) return {productByHandle:clone(state.products.find(p=>p.handle===v.handle)||null)};
    if (query.includes('mutation CreateTour')) {
      const input=v.input; const variant=input.variants[0];
      const product={id:`p${state.products.length}`,handle:input.handle,status:input.status,tags:input.tags,date:{value:input.metafields.find(f=>f.key==='date').value},publishedOnPublication:false,
        variants:{nodes:[{id:`v${state.products.length}`,price:variant.price,inventoryPolicy:variant.inventoryPolicy,inventoryQuantity:variant.inventoryQuantities?.[0].quantity||0,requiresComponents:variant.requiresComponents,inventoryItem:{id:`i${state.products.length}`,...variant.inventoryItem},productVariantComponents:{nodes:[]}}]}};
      state.products.push(product);
      return {productSet:{userErrors:[],product:clone(product)}};
    }
    if (query.includes('mutation TourBundle')) {
      if (state.failBundle) throw new Error('Bundle service unavailable');
      const input=v.input[0], p=state.products.find(p=>p.variants.nodes[0].id===input.parentProductVariantId);
      p.variants.nodes[0].productVariantComponents.nodes=input.productVariantRelationshipsToCreate.map(c=>({quantity:c.quantity,productVariant:{id:c.id}}));
      return {productVariantRelationshipBulkUpdate:{userErrors:[],parentProductVariants:clone(p.variants.nodes)}};
    }
    if (query.includes('mutation TourStatus')) {state.products.find(p=>p.id===v.product.id).status=v.product.status;return ok('productUpdate');}
    if (query.includes('mutation PublishTour')) {
      if (state.failPublish) throw new Error('Publication unavailable');
      state.products.find(p=>p.id===v.id).publishedOnPublication=true;return ok('publishablePublish');
    }
    if (query.includes('mutation TourPrice')) {state.products.find(p=>p.id===v.id).variants.nodes[0].price=v.variants[0].price;return ok('productVariantsBulkUpdate');}
    throw new Error(`Unhandled test operation: ${query}`);
  };
  const run = options => syncTourCatalog({graphql,locationId:'location',publicationId:'publication',now,...options});
  return {state,run};
}
test('creates paired tagged non-shipping products with 10 shared seats, and repeated sync never restocks sales', async () => {
  const {state,run}=fixture(); const first=await run();
  assert.equal(first.created.length,8);
  const seat=state.products.find(p=>p.handle==='tour-seat-2026-11-15');
  const bus=state.products.find(p=>p.handle==='tour-bus-2026-11-15');
  assert.equal(seat.variants.nodes[0].inventoryQuantity,10);
  assert.equal(seat.variants.nodes[0].inventoryItem.requiresShipping,false);
  assert.ok(seat.tags.includes('tour-seat')); assert.ok(bus.tags.includes('tour-bus'));
  assert.equal(bus.variants.nodes[0].productVariantComponents.nodes[0].quantity,10);
  assert.equal(bus.variants.nodes[0].productVariantComponents.nodes[0].productVariant.id,seat.variants.nodes[0].id);
  seat.variants.nodes[0].inventoryQuantity=7;
  assert.equal((await run()).created.length,0);
  assert.equal(seat.variants.nodes[0].inventoryQuantity,7);
  assert.equal(state.products.length,8);
});
test('blackouts archive both products; reopening preserves remaining seats; disabling closes every date', async () => {
  const {state,run}=fixture(); await run();
  const seat=state.products.find(p=>p.handle==='tour-seat-2026-11-15'); seat.variants.nodes[0].inventoryQuantity=4;
  state.fields.blackout_dates='2026-11-15';
  assert.equal((await run()).archived.length,2); assert.equal(seat.status,'ARCHIVED');
  state.fields.blackout_dates='';assert.equal((await run()).reopened.length,2);
  assert.equal(seat.variants.nodes[0].inventoryQuantity,4);
  state.fields.enabled='false';assert.equal((await run()).archived.length,8);
});
test('entering the three-day cutoff closes both products', async () => {
  const {run}=fixture(); await run();
  const result=await run({now:new Date('2026-11-13T20:00:00Z')});
  assert.ok(result.archived.includes('tour-seat-2026-11-15'));
  assert.ok(result.archived.includes('tour-bus-2026-11-15'));
  assert.ok(!result.created.includes('tour-seat-2026-11-15'));
});
test('late-evening sync anticipates tomorrow cutoff without creating beyond six calendar months', async () => {
  const {state,run}=fixture(); state.fields.operating_days='["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]'; state.fields.months_ahead='6';
  const result=await run({now:new Date('2026-11-12T03:00:00Z'),dryRun:true});
  assert.equal(result.dates[0],'2026-11-15'); assert.equal(result.dates.at(-1),'2027-05-11');
  assert.equal(state.products.length,0);assert.equal(state.lock,null);
});
test('bundle failure leaves the pair unsellable; retry repairs it without adding seat inventory', async () => {
  const {state,run}=fixture();state.failBundle=true;
  await assert.rejects(run(),/Bundle service unavailable/);
  assert.ok(state.products.every(p=>p.status==='ARCHIVED'));
  assert.equal(JSON.parse(state.lock.value).expiresAt,0);
  state.failBundle=false; await run();
  assert.equal(state.products[0].variants.nodes[0].inventoryQuantity,10);
  assert.ok(state.products.every(p=>p.status==='ACTIVE'));
});
test('publication failure is retried without duplicate products or inventory reset', async () => {
  const {state,run}=fixture();state.failPublish=true;
  await assert.rejects(run(),/Publication unavailable/);
  state.products.find(p=>p.handle.startsWith('tour-seat')).variants.nodes[0].inventoryQuantity=8;
  state.failPublish=false;await run();
  assert.equal(state.products.length,8);
  assert.equal(state.products[0].variants.nodes[0].inventoryQuantity,8);
  assert.ok(state.products.every(p=>p.publishedOnPublication));
});
test('overlapping run makes no product changes; invalid schedule also makes no changes', async () => {
  const {state,run}=fixture();state.lock={value:JSON.stringify({token:'other',expiresAt:Date.now()+100000}),compareDigest:'digest'};
  assert.equal((await run()).busy,true);assert.equal(state.products.length,0);
  state.fields.blackout_dates='bad date';await assert.rejects(run(),/Invalid tour blackout/);
  assert.equal(state.products.length,0);
});

test('simultaneous runs use compare-and-set so only one initializes inventory', async () => {
  const {state,run}=fixture();
  const results=await Promise.all([run(),run()]);
  assert.equal(results.filter(r=>r.busy).length,1);
  assert.equal(state.products.length,8);
});

test('a seat configured to oversell is taken off sale with its bus bundle', async () => {
  const {state,run}=fixture(); await run();
  const seat=state.products.find(p=>p.handle==='tour-seat-2026-11-15');
  seat.variants.nodes[0].inventoryPolicy='CONTINUE';
  await assert.rejects(run(),/unsafe inventory settings/);
  assert.equal(seat.status,'ARCHIVED');
  assert.equal(state.products.find(p=>p.handle==='tour-bus-2026-11-15').status,'ARCHIVED');
});
