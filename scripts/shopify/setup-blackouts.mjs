import {writeFileSync} from 'node:fs';
import {adminGraphql,assertUserErrors} from './lib.mjs';
import {BLACKOUT_TYPE,BLACKOUT_HANDLE,BLACKOUT_SOURCE,parseBlackoutDates} from '../../src/lib/blackout-dates.ts';
const apply=process.argv.includes('--apply');
const retire=process.argv.includes('--retire-legacy-fields');
const site=(process.argv.find(arg=>arg.startsWith('--site='))?.slice(7)||'https://aava-site.vercel.app').replace(/\/$/,'');
const data=await adminGraphql(`query BlackoutMigration {
 sharedDefinition:metaobjectDefinitionByType(type:"booking_blackouts"){id fieldDefinitions{key}}
 shared:metaobjectByHandle(handle:{type:"booking_blackouts",handle:"default"}){id fields{key value}}
 tourDefinition:metaobjectDefinitionByType(type:"tour_schedule"){id fieldDefinitions{key}}
 tour:metaobjectByHandle(handle:{type:"tour_schedule",handle:"default"}){id fields{key value}}
 deliveryDefinition:metaobjectDefinitionByType(type:"delivery_schedule"){id fieldDefinitions{key}}
 delivery:metaobjectByHandle(handle:{type:"delivery_schedule",handle:"default"}){id fields{key value}}
}`);
const value=(record,key)=>record?.fields.find(field=>field.key===key)?.value||'';
if(!data.shared&&!data.tour)throw new Error('Create the tour schedule first so its blackout dates can be migrated.');
const dates=parseBlackoutDates(data.shared?value(data.shared,'dates'):value(data.tour,'blackout_dates'));
const selected=new Set(dates);
if(!data.shared&&parseBlackoutDates(value(data.delivery,'blackout_dates')).some(date=>!selected.has(date)))throw new Error('Delivery has additional blackout dates. Reconcile them with the tour list before migration.');
if(retire){
 if(!data.shared)throw new Error('Create the shared blackout list before retiring legacy fields.');
 if(new URL(site).protocol!=='https:')throw new Error('Use the HTTPS production site URL for rollout verification.');
 for(const path of ['/api/delivery/availability?zip=22205','/api/tours/availability?type=public&guests=1']){
  const response=await fetch(site+path,{signal:AbortSignal.timeout(30_000)});const result=await response.json();
  if(!response.ok||result.blackoutSource!==BLACKOUT_SOURCE)throw new Error('Deploy the shared-blackout code to production before retiring old fields.');
 }
 for(const kind of ['tour','delivery']){
  const definition=data[kind+'Definition'];if(!definition?.fieldDefinitions.some(f=>f.key==='blackout_dates'))continue;
  if(apply){const r=await adminGraphql(`mutation($id:ID!,$definition:MetaobjectDefinitionUpdateInput!){metaobjectDefinitionUpdate(id:$id,definition:$definition){metaobjectDefinition{id} userErrors{message}}}`,{id:definition.id,definition:{fieldDefinitions:[{delete:{key:'blackout_dates'}}]}});assertUserErrors(r.metaobjectDefinitionUpdate,'Removing legacy '+kind+' blackout field');}
  console.log((apply?'Removed':'Would remove')+' legacy '+kind+' blackout field.');
 }
 process.exit(0);
}
const products=[];let after=null;
do{
 const r=await adminGraphql(`query($after:String){products(first:100,after:$after,query:"tag:delivery-slot OR tag:scheduled-tour"){nodes{id handle status tags} pageInfo{hasNextPage endCursor}}}`,{after});products.push(...r.products.nodes);after=r.products.pageInfo.hasNextPage?r.products.pageInfo.endCursor:null;
 if(r.products.pageInfo.hasNextPage&&!after)throw new Error('Shopify did not provide a product cursor.');
}while(after);
const closing=products.filter(product=>{
 const delivery=/^delivery-slot-(\d{4}-\d{2}-\d{2})$/.exec(product.handle);
 const tour=/^tour-(?:seat|bus)-(\d{4}-\d{2}-\d{2})$/.exec(product.handle);
 return product.status!=='ARCHIVED'&&((delivery&&product.tags.includes('delivery-slot')&&selected.has(delivery[1]))||(tour&&product.tags.includes('scheduled-tour')&&selected.has(tour[1])));
});
console.log(JSON.stringify({source:data.shared?BLACKOUT_SOURCE:'tour_schedule/default',dates,createDefinition:!data.sharedDefinition,createRecord:!data.shared,archiveProducts:closing.map(p=>p.handle),dryRun:!apply},null,2));
if(!apply)process.exit(0);
const backup=`/tmp/aava-blackout-migration-${Date.now()}.json`;writeFileSync(backup,JSON.stringify(data,null,2));console.log('Migration snapshot: '+backup);
const definitions=[{name:'Name',key:'name',type:'single_line_text_field',required:true},{name:'Dates',key:'dates',type:'multi_line_text_field',description:'Shared closures for deliveries and tours. One YYYY-MM-DD date per line; leave empty for no closures.'}];
if(!data.sharedDefinition){const r=await adminGraphql(`mutation($definition:MetaobjectDefinitionCreateInput!){metaobjectDefinitionCreate(definition:$definition){metaobjectDefinition{id} userErrors{message}}}`,{definition:{name:'Blackout dates',type:BLACKOUT_TYPE,displayNameKey:'name',description:'One business-wide list used by delivery and tour schedules, availability, checkout, and catalog jobs.',fieldDefinitions:definitions}});assertUserErrors(r.metaobjectDefinitionCreate,'Creating shared blackout definition');}
if(!data.shared){const r=await adminGraphql(`mutation($metaobject:MetaobjectCreateInput!){metaobjectCreate(metaobject:$metaobject){metaobject{id} userErrors{message}}}`,{metaobject:{type:BLACKOUT_TYPE,handle:BLACKOUT_HANDLE,fields:[{key:'name',value:'Business blackout dates'},...(dates.length?[{key:'dates',value:dates.join('\n')}]:[])]}});assertUserErrors(r.metaobjectCreate,'Copying tour blackout dates');}
// Keep the old deployed code protected until the new code is merged/deployed.
for(const kind of ['tour','delivery']){
 const definition=data[kind+'Definition'],record=data[kind];if(!definition?.fieldDefinitions.some(f=>f.key==='blackout_dates')||!record)continue;
 const r=await adminGraphql(`mutation($id:ID!,$metaobject:MetaobjectUpdateInput!){metaobjectUpdate(id:$id,metaobject:$metaobject){metaobject{id} userErrors{message}}}`,{id:record.id,metaobject:{fields:[{key:'blackout_dates',value:dates.join('\n')}]}});assertUserErrors(r.metaobjectUpdate,'Maintaining migration compatibility for '+kind);
 const d=await adminGraphql(`mutation($id:ID!,$definition:MetaobjectDefinitionUpdateInput!){metaobjectDefinitionUpdate(id:$id,definition:$definition){metaobjectDefinition{id} userErrors{message}}}`,{id:definition.id,definition:{fieldDefinitions:[{update:{key:'blackout_dates',name:'Blackout dates (legacy migration copy)',description:'Edit Content → Metaobjects → Blackout dates → Business blackout dates instead. This compatibility field is retired after deployment.'}}]}});assertUserErrors(d.metaobjectDefinitionUpdate,'Labeling legacy '+kind+' field');
}
for(const product of closing){const r=await adminGraphql(`mutation($product:ProductUpdateInput!){productUpdate(product:$product){product{id status} userErrors{message}}}`,{product:{id:product.id,status:'ARCHIVED'}});assertUserErrors(r.productUpdate,'Archiving '+product.handle);}
console.log(`Shared blackout list ready: ${dates.length} dates. Archived ${closing.length} products without changing inventory. After deployment, run with --retire-legacy-fields --apply to remove the old fields.`);
