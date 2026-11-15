import {checkSiteLinks} from '../scripts/check-site-links.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {siteRelativeHref,relativeSiteLinks} from '../src/lib/site-links.ts';
test('internal URLs stay on the visited host and retain paths, queries, and fragments',()=>{
 for(const value of ['https://www.allaboardva.com/contact?topic=Wine%20tour#form','http://allaboardva.com/contact?topic=Wine%20tour#form','//www.allaboardva.com/contact?topic=Wine%20tour#form']) assert.equal(siteRelativeHref(value),'/contact?topic=Wine%20tour#form');
 assert.equal(siteRelativeHref('https://allaboardva.com'),'/');
 assert.equal(siteRelativeHref('https://aava-site.vercel.app/contact'),'/contact');
 assert.equal(siteRelativeHref('/contact'),'/contact');
 assert.equal(siteRelativeHref('/custom-board-request-form'),'/custom-board-request');
 assert.equal(siteRelativeHref('https://allaboardva.com/terms'),'/terms-conditions');
 assert.equal(siteRelativeHref('https://www.allaboardva.com/experiences?guests=5#choose-region'),'/experiences?guests=5#plan-tour');
 assert.equal(siteRelativeHref('/experiences#choose-region'),'/experiences#plan-tour');
});
test('external hosts, mail, telephone, and local fragments are not rewritten',()=>{
 for(const value of ['https://example.com/page','https://allaboardva.com.example.org/path','https://notallaboardva.com/path','mailto:info.allaboardva@gmail.com','tel:+17147159836','#details','relative-page']) assert.equal(siteRelativeHref(value),value);
});
test('Shopify HTML links normalize without changing external links or asset URLs',()=>{
 const html=`<p><a href="https://www.allaboardva.com/contact">Contact</a> <a href='http://allaboardva.com/terms-conditions'>Terms</a> <a href=https://www.allaboardva.com/experiences>Tour</a><a href="https://example.org">External</a><img src="https://www.allaboardva.com/image.png"></p>`;
 const changed=relativeSiteLinks(html);
 assert.match(changed, /href="\/contact"/);assert.match(changed,/href='\/terms-conditions'/);assert.match(changed,/href=\/experiences>/);
 assert.match(changed,/href="https:\/\/example.org"/);assert.match(changed,/src="https:\/\/www.allaboardva.com\/image.png"/);
});

test('link crawl accepts relative navigation on the eventual production hostname',async()=>{
 const result=await checkSiteLinks('https://www.allaboardva.com',async()=>new Response('<h1 id="details">Page</h1><a href="/contact#details">Contact</a>',{status:200}));
 assert.match(result,/no broken links/);
});
test('link crawl rejects hard-coded internal hosts while permitting external links',async()=>{
 await assert.rejects(()=>checkSiteLinks('https://www.allaboardva.com',async()=>new Response('<a href="https://www.allaboardva.com/contact">Contact</a>')),/absolute internal link/);
 const result=await checkSiteLinks('http://127.0.0.1:4330',async()=>new Response('<a href="https://example.org/story">Press</a>'));
 assert.match(result,/no broken links/);
});
test('link crawl reports missing pages and invalid fragment targets',async()=>{
 await assert.rejects(()=>checkSiteLinks('https://www.allaboardva.com',async url=>new Response('<a href="/missing">Missing</a>',{status:new URL(url).pathname==='/missing'?404:200})),/HTTP 404/);
 await assert.rejects(()=>checkSiteLinks('https://www.allaboardva.com',async()=>new Response('<a href="#missing">Details</a>')),/missing anchor/);
});
