import { adminGraphql, assertUserErrors } from './lib.mjs';
const type = 'tour_schedule';
const fields = [
  {name:'Schedule name',key:'name',type:'single_line_text_field',required:true},
  {name:'Enabled',key:'enabled',type:'boolean',required:true,description:'Turn off to close all generated tour dates.'},
  {name:'Minimum days in advance',key:'minimum_days',type:'number_integer',required:true,validations:[{name:'min',value:'1'},{name:'max',value:'365'}]},
  {name:'Months ahead to create products',key:'months_ahead',type:'number_integer',required:true,validations:[{name:'min',value:'1'},{name:'max',value:'12'}],description:'Inclusive calendar-month horizon, measured from today in Eastern Time.'},
  {name:'Operating days',key:'operating_days',type:'list.single_line_text_field',required:true,validations:[{name:'choices',value:JSON.stringify(['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])}]},
  {name:'Blackout dates',key:'blackout_dates',type:'multi_line_text_field',description:'Any number of dates, one YYYY-MM-DD per line. No fixed entry-count limit.'},
  {name:'Public seat price (USD)',key:'seat_price',type:'number_decimal',required:true,validations:[{name:'min',value:'0.01'}]},
  {name:'Whole bus price (USD)',key:'bus_price',type:'number_decimal',required:true,validations:[{name:'min',value:'0.01'}]},
];
const existing = await adminGraphql(`query {metaobjectDefinitionByType(type:"tour_schedule"){id fieldDefinitions{key}} metaobjectByHandle(handle:{type:"tour_schedule",handle:"default"}){id fields{key value}}}`);
if (!existing.metaobjectDefinitionByType) {
  const r = await adminGraphql(`mutation($definition:MetaobjectDefinitionCreateInput!){metaobjectDefinitionCreate(definition:$definition){metaobjectDefinition{id} userErrors{message}}}`,{definition:{name:'Tour schedule',type,displayNameKey:'name',description:'One daily departure with 10 shared seats. Edit the default entry. Blackout dates and booking limits control generated seat and whole-bus bundle products. Closed dates are archived, never deleted.',fieldDefinitions:fields}});
  assertUserErrors(r.metaobjectDefinitionCreate,'Creating tour schedule definition');
} else {
  const missing = fields.filter(f => !existing.metaobjectDefinitionByType.fieldDefinitions.some(e=>e.key===f.key));
  if (missing.length) {
    const r=await adminGraphql(`mutation($id:ID!,$definition:MetaobjectDefinitionUpdateInput!){metaobjectDefinitionUpdate(id:$id,definition:$definition){metaobjectDefinition{id} userErrors{message}}}`,{id:existing.metaobjectDefinitionByType.id,definition:{fieldDefinitions:missing.map(create=>({create:{...create,required:false}}))}});
    assertUserErrors(r.metaobjectDefinitionUpdate,'Adding tour schedule fields');
  }
}
if (!existing.metaobjectByHandle) {
  const defaults = {
    name:'Tour schedule',enabled:'true',minimum_days:'3',months_ahead:'6',
    operating_days:JSON.stringify(['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']),
    blackout_dates:'2026-11-25\n2026-11-26\n2026-11-27\n2026-11-28\n2026-11-29\n2026-11-30',
    seat_price:'125.00',bus_price:'1250.00',
  };
  const r=await adminGraphql(`mutation($metaobject:MetaobjectCreateInput!){metaobjectCreate(metaobject:$metaobject){metaobject{id} userErrors{message}}}`,{metaobject:{type,handle:'default',fields:Object.entries(defaults).map(([key,value])=>({key,value}))}});
  assertUserErrors(r.metaobjectCreate,'Creating default tour schedule');
}
if (existing.metaobjectByHandle && !existing.metaobjectByHandle.fields.some(f=>f.key==='name' && f.value)) {
  const r=await adminGraphql(`mutation($id:ID!,$metaobject:MetaobjectUpdateInput!){metaobjectUpdate(id:$id,metaobject:$metaobject){metaobject{id} userErrors{message}}}`,{id:existing.metaobjectByHandle.id,metaobject:{fields:[{key:'name',value:'Tour schedule'}]}});
  assertUserErrors(r.metaobjectUpdate,'Naming tour schedule');
}
if (existing.metaobjectDefinitionByType) {
  const r=await adminGraphql(`mutation($id:ID!,$definition:MetaobjectDefinitionUpdateInput!){metaobjectDefinitionUpdate(id:$id,definition:$definition){metaobjectDefinition{id} userErrors{message}}}`,{id:existing.metaobjectDefinitionByType.id,definition:{displayNameKey:'name'}});
  assertUserErrors(r.metaobjectDefinitionUpdate,'Setting tour schedule display name');
}
console.log('Tour schedule ready in Shopify → Content → Metaobjects → Tour schedule. Existing settings preserved.');
