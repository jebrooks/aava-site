import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {parseBlackoutDates} from '../src/lib/blackout-dates.ts';
import {loadSharedBlackoutDates} from '../src/lib/shopify/blackouts.ts';

test('shared list validates real dates, supports arbitrary lengths and explicit empty lists',()=>{
 assert.deepEqual(parseBlackoutDates('2026-12-25\n2026-11-25,2026-12-25'),['2026-11-25','2026-12-25']);
 assert.deepEqual(parseBlackoutDates('["2026-12-25","2026-11-25"]'),['2026-11-25','2026-12-25']);
 assert.deepEqual(parseBlackoutDates(''),[]);
 assert.equal(parseBlackoutDates(Array.from({length:500},(_,i)=>new Date(Date.UTC(2027,0,i+1)).toISOString().slice(0,10)).join('\n')).length,500);
 for(const raw of ['2026-02-30','2026-1-01','[null]','["2026-12-25"','not a date'])assert.throws(()=>parseBlackoutDates(raw),/Invalid blackout/);
});
test('missing or invalid shared metaobject fails closed',async()=>{
 await assert.rejects(()=>loadSharedBlackoutDates(async()=>({metaobjectByHandle:null})),/booking_blackouts\/default/);
 await assert.rejects(()=>loadSharedBlackoutDates(async()=>({metaobjectByHandle:{fields:[{key:'dates',value:'bad'}]}})),/Invalid blackout/);
});

test('delivery availability, checkout checks, and catalog synchronization use the shared list',async t=>{
 const now=new Date('2026-11-11T18:00:00Z');
 const config={timezone:'America/New_York',eligibleZips:['22205'],dailyCapacity:3,leadTimeHours:0,horizonDays:7,blackoutDates:[],weeklyWindows:Object.fromEntries(Array.from({length:7},(_,i)=>[String(i),[{label:'9–11 AM',start:'09:00',end:'11:00'}]]))};
 const fields={eligible_zips:'22205',daily_capacity:'3',lead_time_hours:'0',horizon_days:'7',weekly_windows:JSON.stringify(config.weeklyWindows),blackout_dates:'2026-11-15'};
 const state={blackouts:'2026-11-14',missing:false,failDelivery:false,failPublish:false,paginate:false,products:[],calls:[]};
 globalThis.__sharedDeliveryTest=state;
 state.graphql=async(query,v={})=>{
  state.calls.push({query,v});
  if(query.includes('query SharedBlackoutDates'))return {metaobjectByHandle:state.missing?null:{fields:[{key:'dates',value:state.blackouts}]}};
  if(query.includes('query DeliverySchedule')){if(state.failDelivery)throw new Error('Schedule unavailable');return {metaobjectByHandle:{fields:Object.entries(fields).map(([key,value])=>({key,value}))}};}
  if(query.includes('query DeliverySlotProducts')){
   const products=state.products.filter(p=>!v.query.includes('status:active')||p.status==='ACTIVE');
   return {products:{nodes:structuredClone(state.paginate?(v.after?products.slice(1):products.slice(0,1)):products),pageInfo:{hasNextPage:state.paginate&&!v.after,endCursor:state.paginate&&!v.after?'next':null}}};
  }
  if(query.includes('mutation PublishDeliverySlot')){if(state.failPublish)throw new Error('Publication unavailable');return {publishablePublish:{userErrors:[]}};}
  if(query.includes('mutation SetDeliverySlotStatus')){state.products.find(p=>p.id===v.identifier.id).status=v.input.status;return {productSet:{product:{id:v.identifier.id},userErrors:[]}};}
  if(query.includes('mutation RenameDeliveryReservation')){
   assert.deepEqual(Object.keys(v.product).sort(),['id','title'],'Renaming must not write inventory or variants');
   state.products.find(p=>p.id===v.product.id).title=v.product.title;
   return {productUpdate:{userErrors:[]}};
  }
  throw new Error('Unexpected delivery mutation/query: '+query);
 };
 const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,ws:false},optimizeDeps:{noDiscovery:true,include:[]},define:{'import.meta.env.SHOPIFY_DELIVERY_LOCATION_ID':JSON.stringify('location'),'import.meta.env.SHOPIFY_STOREFRONT_PUBLICATION_ID':JSON.stringify('publication'),'import.meta.env.DELIVERY_SCHEDULE_JSON':JSON.stringify(JSON.stringify(config))},plugins:[{name:'delivery-fixtures',enforce:'pre',resolveId(id){if(id==='./client')return '\0delivery-client';},load(id){if(id==='\0delivery-client')return `export class ShopifyApiError extends Error { constructor(message,status=502){super(message);this.status=status;} } export function adminGraphql(...args){return globalThis.__sharedDeliveryTest.graphql(...args);}`;}}]});
 t.after(async()=>{await server.close();delete globalThis.__sharedDeliveryTest;});
 const service=await server.ssrLoadModule('/src/lib/shopify/schedule.ts');
 state.products=service.getEligibleDates(config,now).map(({date},i)=>({id:'p'+i,handle:'delivery-slot-'+date,status:'ACTIVE',configuredCapacity:{value:'3'},variants:{nodes:[{id:'v'+i,title:'Daily order',inventoryQuantity:2,inventoryItem:{id:'i'+i}}]}}));
 const blocked=state.products.find(p=>p.handle==='delivery-slot-2026-11-14');const original=structuredClone(blocked);
 const availability=await service.getAvailableDeliverySlots('22205',now);
 assert.equal(availability.blackoutSource,'booking_blackouts/default');assert.ok(!availability.slots.some(s=>s.date==='2026-11-14'));assert.ok(availability.slots.some(s=>s.date==='2026-11-15'),'Legacy per-schedule list is ignored');
 await assert.rejects(()=>service.assertDeliverySlotAvailable('22205',blocked.variants.nodes[0].id,'2026-11-14:09:00',now),/no longer available/);
 state.paginate=true;
 const closed=await service.materializeDeliverySlots(now);assert.ok(closed.archived.includes(blocked.handle));assert.equal(blocked.status,'ARCHIVED');assert.equal(blocked.variants.nodes[0].inventoryQuantity,2);
 assert.ok(state.products.every(p=>p.title==='Delivery Time Reservation — '+p.handle.slice('delivery-slot-'.length)));
 const renames=state.calls.filter(c=>c.query.includes('mutation RenameDeliveryReservation')).length;
 await service.materializeDeliverySlots(now);
 assert.equal(state.calls.filter(c=>c.query.includes('mutation RenameDeliveryReservation')).length,renames,'Correct titles must not be rewritten each run');
 state.blackouts='';state.failPublish=true;await assert.rejects(()=>service.materializeDeliverySlots(now),/Publication unavailable/);assert.equal(blocked.status,'ARCHIVED');state.failPublish=false;const reopened=await service.materializeDeliverySlots(now);assert.ok(reopened.reopened.includes(blocked.handle));assert.equal(blocked.status,'ACTIVE');assert.deepEqual(blocked.variants,original.variants);assert.equal(blocked.id,original.id);assert.equal(reopened.created.length,0);
 state.missing=true;state.failDelivery=true;const writes=state.calls.filter(c=>c.query.includes('mutation')).length;
 await assert.rejects(()=>service.getAvailableDeliverySlots('22205',now),/booking_blackouts\/default/);
 await assert.rejects(()=>service.materializeDeliverySlots(now),/booking_blackouts\/default/);
 assert.equal(state.calls.filter(c=>c.query.includes('mutation')).length,writes,'Environment fallback must not bypass missing shared dates');
});
