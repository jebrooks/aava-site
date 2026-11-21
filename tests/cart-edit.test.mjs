import test from 'node:test';
import assert from 'node:assert/strict';
import { cartCopyWithLineChange, cartCopyWithAddedLine, cartCopyWithoutUnusedDelivery, cartCopyWithDeliveryWindow } from '../src/lib/cart-edit.ts';
const fixture = () => ({
  attributes: [{key:'Checkout locked',value:'true'},{key:'Delivery ZIP',value:'22205'}],
  lines: {nodes: [
    {id:'first',quantity:2,merchandise:{id:'board'},attributes:[{key:'Cheeses',value:'Brie'}]},
    {id:'second',quantity:1,merchandise:{id:'board'},attributes:[{key:'Cheeses',value:'Gouda'}]},
    {id:'window',quantity:1,merchandise:{id:'delivery'},attributes:[]},
  ]},
});
test('removes only the selected customized board and preserves delivery on an editable copy', () => {
  const original = fixture(); const snapshot = structuredClone(original);
  const input = cartCopyWithLineChange(original,'first',0);
  assert.deepEqual(input.lines,[
    {merchandiseId:'board',quantity:1,attributes:[{key:'Cheeses',value:'Gouda'}]},
    {merchandiseId:'delivery',quantity:1,attributes:[]},
  ]);
  assert.deepEqual(input.attributes,[{key:'Delivery ZIP',value:'22205'}]);
  assert.deepEqual(original,snapshot,'Original validated checkout must not change');
});
test('quantity changes preserve board ingredients and the other lines', () => {
  const input = cartCopyWithLineChange(fixture(),'second',3);
  assert.deepEqual(input.lines.map(l=>l.quantity),[2,3,1]);
  assert.deepEqual(input.lines[1].attributes,[{key:'Cheeses',value:'Gouda'}]);
});
test('the final item can be removed into an empty editable cart', () => {
  const cart=fixture();cart.lines.nodes=cart.lines.nodes.slice(0,1);
  assert.deepEqual(cartCopyWithLineChange(cart,'first',0).lines,[]);
});
test('rejects missing lines and invalid quantities', () => {
  assert.throws(()=>cartCopyWithLineChange(fixture(),'missing',0),/not found/);
  for(const quantity of [-1,0.5,51,NaN]) assert.throws(()=>cartCopyWithLineChange(fixture(),'first',quantity),/quantity/);
});

test('adding to a checkout cart preserves the saved delivery window and existing customized boards', () => {
  const original=fixture();const snapshot=structuredClone(original);
  const input=cartCopyWithAddedLine(original,'new-board',2,[{key:'Meats',value:'Salami'}]);
  assert.deepEqual(input.attributes,[{key:'Delivery ZIP',value:'22205'}]);
  assert.deepEqual(input.lines,[
    {merchandiseId:'board',quantity:2,attributes:[{key:'Cheeses',value:'Brie'}]},
    {merchandiseId:'board',quantity:1,attributes:[{key:'Cheeses',value:'Gouda'}]},
    {merchandiseId:'delivery',quantity:1,attributes:[]},
    {merchandiseId:'new-board',quantity:2,attributes:[{key:'Meats',value:'Salami'}]},
  ]);
  assert.deepEqual(original,snapshot);
});

const deliveryCart = () => ({
  attributes: [
    {key:'Checkout locked',value:'true'},
    {key:'Delivery ZIP',value:'22205'},
    {key:'Delivery date',value:'2026-11-20'},
    {key:'Delivery window',value:'Afternoon'},
    {key:'Delivery slot key',value:'2026-11-20-afternoon'},
    {key:'Delivery timezone',value:'America/New_York'},
    {key:'Note',value:'Keep this note'},
  ],
  lines: {nodes: [
    {id:'gift',quantity:2,merchandise:{id:'gift-variant',requiresShipping:false,product:{handle:'gift-card'}},attributes:[
      {key:'Recipient email',value:'friend@example.com'},
      {key:'Send on',value:'2026-12-01'},
      {key:'__shopify_send_gift_card_to_recipient',value:'true'},
    ]},
    {id:'slot',quantity:1,merchandise:{id:'slot-variant',requiresShipping:true,product:{handle:'delivery-slot-2026-11-20'}},attributes:[]},
  ]},
});

test('delivery details go on physical boards, remove legacy reservations and preserve gifts and open checkouts', () => {
  const cart=deliveryCart();
  cart.lines.nodes.push({id:'board',quantity:2,merchandise:{id:'board-variant',requiresShipping:true,product:{handle:'board'}},attributes:[{key:'Cheeses',value:'Brie'},{key:'Delivery window',value:'Old'}]});
  const snapshot=structuredClone(cart);
  const slot={date:'2026-12-02',label:'1:00–3:00 PM'};
  const input=cartCopyWithDeliveryWindow(cart,slot);
  assert.equal(input.lines.length,2);
  assert.deepEqual(input.lines[1].attributes,[
    {key:'Cheeses',value:'Brie'},
    {key:'Delivery date',value:slot.date},
    {key:'Delivery window',value:slot.label},
    {key:'Delivery timezone',value:'America/New_York'},
  ]);
  assert.deepEqual(input.lines[0].attributes,cart.lines.nodes[0].attributes);
  assert.ok(!input.attributes.some(a=>a.key==='Checkout locked'));
  assert.deepEqual(cart,snapshot);
  cart.lines.nodes.splice(1,1);
  cart.lines.nodes[1].attributes=input.lines[1].attributes;
  assert.equal(cartCopyWithDeliveryWindow(cart,slot),null);
  const updated=cartCopyWithDeliveryWindow(cart,slot,[{key:'Delivery ZIP',value:'22201'}]);
  assert.deepEqual(updated.attributes,[{key:'Note',value:'Keep this note'},{key:'Delivery ZIP',value:'22201'}]);
});

test('digital-only cleanup drops the shipping slot and delivery metadata, preserving gifts and the original checkout', () => {
  const cart=deliveryCart();const snapshot=structuredClone(cart);
  const input=cartCopyWithoutUnusedDelivery(cart);
  assert.deepEqual(input.attributes,[{key:'Note',value:'Keep this note'}]);
  assert.deepEqual(input.lines,[{merchandiseId:'gift-variant',quantity:2,attributes:cart.lines.nodes[0].attributes}]);
  assert.deepEqual(cart,snapshot);
});

test('mixed gift and physical-board orders retain delivery, including the shipping capacity line', () => {
  const cart=deliveryCart();
  cart.lines.nodes.push({id:'board',quantity:1,merchandise:{id:'board-variant',requiresShipping:true,product:{handle:'great-american-graze'}},attributes:[]});
  assert.equal(cartCopyWithoutUnusedDelivery(cart),null);
});

test('stale delivery metadata without a slot still creates a clean digital checkout', () => {
  const cart=deliveryCart();cart.lines.nodes.pop();
  const input=cartCopyWithoutUnusedDelivery(cart);
  assert.deepEqual(input.attributes,[{key:'Note',value:'Keep this note'}]);
  assert.equal(input.lines.length,1);
});

test('removing the last customer item does not leave an orphan delivery purchase', () => {
  const cart=deliveryCart();cart.lines.nodes.shift();
  assert.deepEqual(cartCopyWithoutUnusedDelivery(cart).lines,[]);
});

test('already clean digital carts can resume checkout without creating more carts', () => {
  const cart=deliveryCart();cart.lines.nodes.pop();cart.attributes=[{key:'Checkout locked',value:'true'}];
  assert.equal(cartCopyWithoutUnusedDelivery(cart),null);
  cart.lines.nodes=[];
  assert.equal(cartCopyWithoutUnusedDelivery(cart),null);
});
