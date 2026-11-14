import test from 'node:test';
import assert from 'node:assert/strict';
import { cartCopyWithLineChange } from '../src/lib/cart-edit.ts';
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
