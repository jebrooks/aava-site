import test from 'node:test';
import assert from 'node:assert/strict';
import { handleContactRequest } from '../src/lib/contact-form.ts';
const input = {
  firstName:'Jane', lastName:'Guest', email:'jane@example.com',phone:'202-555-0199',topic:'Wine tour',
  message:'Can we plan a tour?\nThank you!',company:'',submissionId:'12345678-1234-4123-8123-123456789abc',
};
const request = (body=input,headers={}) => new Request('https://example.com/api/contact',{
  method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.com',...headers},body:JSON.stringify(body),
});
const fixture = () => {
  const sent=[];
  const options={apiKey:'test-secret',from:'All ABoard VA <website@mail.example.com>',to:'owner@example.com',allow:()=>true,
    fetch:async(url,init)=>{sent.push({url,init,payload:JSON.parse(init.body)});return Response.json({id:'email-123'});}};
  return {options,sent};
};
test('sends plain text to the configured inbox with visitor reply-to; ignores submitted sender and recipient',async()=>{
  const {options,sent}=fixture();const response=await handleContactRequest(request({...input,to:'attacker@example.com',from:'attacker@example.com'}),options);
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});assert.equal(sent.length,1);
  assert.equal(sent[0].url,'https://api.resend.com/emails');assert.deepEqual(sent[0].payload.to,['owner@example.com']);
  assert.equal(sent[0].payload.from,options.from);assert.equal(sent[0].payload.reply_to,input.email);
  assert.match(sent[0].payload.text,/Jane Guest/);assert.ok(sent[0].payload.text.endsWith(input.message));assert.equal(sent[0].payload.html,undefined);
  assert.equal(sent[0].init.headers['Idempotency-Key'],'contact/'+input.submissionId);
  assert.equal(response.headers.get('cache-control'),'no-store');
});
test('rejects missing fields, invalid topics, header injection, and overlong messages without sending',async()=>{
  for(const changes of [{firstName:''},{email:'bad'},{email:'jane@example.com\r\nBcc: other@example.com'},{topic:'arbitrary subject'},{message:'a'.repeat(10001)},{phone:{value:'123'}}]){
    const {options,sent}=fixture();const response=await handleContactRequest(request({...input,...changes}),options);assert.equal(response.status,400);assert.equal(sent.length,0);
  }
});
test('blocks cross-origin submissions and rate-limited clients',async()=>{
  const {options,sent}=fixture();assert.equal((await handleContactRequest(request(input,{Origin:'https://elsewhere.com'}),options)).status,403);
  assert.equal((await handleContactRequest(request(),{...options,allow:()=>false})).status,429);assert.equal(sent.length,0);
});
test('honeypot submissions appear successful but never send email',async()=>{
  const {options,sent}=fixture();assert.equal((await handleContactRequest(request({...input,company:'Bot company'}),options)).status,200);assert.equal(sent.length,0);
});
test('missing credentials, provider failures, and network failures do not report success or expose secrets',async()=>{
  const {options,sent}=fixture();assert.equal((await handleContactRequest(request(),{...options,apiKey:''})).status,503);assert.equal(sent.length,0);
  for(const send of [async()=>Response.json({message:'Private provider error'}, {status:422}),async()=>{throw new Error('test-secret');},async()=>Response.json({})]){
    const response=await handleContactRequest(request(),{...options,fetch:send});assert.equal(response.status,502);const text=await response.text();assert.doesNotMatch(text,/test-secret|Private provider/);assert.match(text,/could not be sent/);
  }
});
test('native HTML submission redirects to confirmation only after provider acceptance',async()=>{
  const {options,sent}=fixture();const req=new Request('https://example.com/api/contact',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:'https://example.com'},body:new URLSearchParams(input)});
  const response=await handleContactRequest(req,options);assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/contact?sent=1');assert.equal(sent.length,1);
});
test('rejects malformed bodies, unsupported content types, and oversized requests',async()=>{
 const {options,sent}=fixture();
 assert.equal((await handleContactRequest(new Request('https://example.com/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'}),options)).status,400);
 assert.equal((await handleContactRequest(request(null),options)).status,400);
 assert.equal((await handleContactRequest(request(input,{'Content-Type':'text/plain'}),options)).status,415);
 assert.equal((await handleContactRequest(request({...input,message:'x'.repeat(21000)}),options)).status,413);
 assert.equal(sent.length,0);
});
