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

test('delivery selection has no inventory dependency and rechecks shared blackouts at checkout',async t=>{
 const now=new Date('2026-11-11T18:00:00Z');
 const config={timezone:'America/New_York',eligibleZips:['22205'],leadTimeHours:0,horizonDays:7,weeklyWindows:Object.fromEntries(Array.from({length:7},(_,i)=>[String(i),[{label:'9–11 AM',start:'09:00',end:'11:00'},{label:'1–3 PM',start:'13:00',end:'15:00'}]]))};
 const fields={eligible_zips:'22205',lead_time_hours:'0',horizon_days:'7',weekly_windows:JSON.stringify(config.weeklyWindows),blackout_dates:'2026-11-15'};
 const state={blackouts:'2026-11-14',missing:false,failDelivery:false,calls:[]};
 globalThis.__sharedDeliveryTest=state;
 state.graphql=async(query)=>{
  state.calls.push(query);
  if(query.includes('query SharedBlackoutDates'))return {metaobjectByHandle:state.missing?null:{fields:[{key:'dates',value:state.blackouts}]}};
  if(query.includes('query DeliverySchedule')){if(state.failDelivery)throw new Error('Schedule unavailable');return {metaobjectByHandle:{fields:Object.entries(fields).map(([key,value])=>({key,value}))}};}
  throw new Error('Delivery must not query products or write inventory: '+query);
 };
 const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,ws:false},optimizeDeps:{noDiscovery:true,include:[]},define:{'import.meta.env.DELIVERY_SCHEDULE_JSON':JSON.stringify(JSON.stringify(config))},plugins:[{name:'delivery-fixtures',enforce:'pre',resolveId(id){if(id==='./client')return '\0delivery-client';},load(id){if(id==='\0delivery-client')return `export class ShopifyApiError extends Error { constructor(message,status=502){super(message);this.status=status;} } export function adminGraphql(...args){return globalThis.__sharedDeliveryTest.graphql(...args);}`;}}]});
 t.after(async()=>{await server.close();delete globalThis.__sharedDeliveryTest;});
 const service=await server.ssrLoadModule('/src/lib/shopify/schedule.ts');
 const availability=await service.getAvailableDeliverySlots('22205',now);
 assert.equal(availability.blackoutSource,'booking_blackouts/default');
 assert.ok(!availability.slots.some(s=>s.date==='2026-11-14'));
 assert.ok(availability.slots.some(s=>s.date==='2026-11-15'),'Legacy per-schedule list is ignored');
 assert.ok(availability.slots.every(s=>s.available && !('variantId' in s)));
 for(let i=0;i<10;i++)await service.assertDeliverySlotAvailable('22205','2026-11-15:09:00',now);
 state.blackouts+='\n2026-11-15';
 await assert.rejects(()=>service.assertDeliverySlotAvailable('22205','2026-11-15:09:00',now),/no longer available/);
 await assert.rejects(()=>service.assertDeliverySlotAvailable('99999','2026-11-16:09:00',now),/outside/);
 await assert.rejects(()=>service.assertDeliverySlotAvailable('22205','2026-11-16:08:00',now),/no longer available/);
 state.blackouts='';
 assert.ok((await service.getAvailableDeliverySlots('22205',now)).slots.some(s=>s.date==='2026-11-15'));
 state.failDelivery=true;
 assert.ok((await service.getAvailableDeliverySlots('22205',now)).slots.length,'Environment fallback works without capacity');
 state.missing=true;
 await assert.rejects(()=>service.getAvailableDeliverySlots('22205',now),/booking_blackouts\/default/);
});
