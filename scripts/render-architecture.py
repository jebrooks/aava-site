#!/usr/bin/env python3
"""Render the GitHub architecture illustrations using only Python's standard library.

Run from any directory: python3 scripts/render-architecture.py
Outputs are deterministic, self-contained SVGs with no remote assets or fonts.
"""
from html import escape
from pathlib import Path
import textwrap

OUT = Path(__file__).resolve().parents[1] / 'docs' / 'architecture'
C = dict(ink='#292B36', muted='#596375', brand='#8A1538', green='#216747',
         purple='#5B45A0', blue='#275E96', amber='#946016', line='#D9DFE7',
         bg='#F6F7FA', white='#FFFFFF')
PALE = dict(brand='#F9EDF1', green='#EAF5EE', purple='#F1EDFA', blue='#EBF2FA', amber='#FBF2E2')

ICONS = {
 'browser': '<rect x="3" y="5" width="26" height="22" rx="3"/><path d="M3 12h26M8 8h1m4 0h1m4 0h1"/>',
 'server': '<rect x="4" y="3" width="24" height="11" rx="3"/><rect x="4" y="18" width="24" height="11" rx="3"/><path d="M9 8h1m4 0h9M9 23h1m4 0h9"/>',
 'bag': '<path d="M7 10h18l3 19H4zM11 11V8a5 5 0 0 1 10 0v3"/><path d="M13 17c5-3 9 3 4 5s-7 2-5 5"/>',
 'code': '<path d="m11 8-8 8 8 8m10-16 8 8-8 8M19 3l-6 26"/>',
 'clock': '<circle cx="16" cy="16" r="13"/><path d="M16 7v10l7 4"/>',
 'calendar': '<rect x="4" y="6" width="24" height="23" rx="3"/><path d="M4 14h24M10 3v7m12-7v7M10 20h3m6 0h3m-12 5h3"/>',
 'gift': '<rect x="4" y="12" width="24" height="7" rx="1"/><path d="M6 19v10h20V19M16 12v17"/><path d="M16 12C3 12 7 0 13 6l3 6c13 0 9-12 3-6z"/>',
 'mail': '<rect x="3" y="6" width="26" height="21" rx="3"/><path d="m4 8 12 10L28 8"/>',
 'branch': '<circle cx="8" cy="5" r="3"/><circle cx="24" cy="8" r="3"/><circle cx="8" cy="27" r="3"/><path d="M8 8v16M24 11v3c0 5-16 3-16 9"/>',
 'check': '<circle cx="16" cy="16" r="13"/><path d="m9 16 5 5 10-11"/>',
 'triangle': '<path d="m16 4 14 24H2z"/>',
 'event': '<path d="m18 2-12 17h10l-2 11 12-17H16z"/>',
 'document': '<path d="M7 2h12l7 7v21H7zM19 2v8h7M11 15h11m-11 5h11m-11 5h7"/>',
}

class Diagram:
 def __init__(self, name, height, title, subtitle, number):
  self.name, self.height = name, height
  self.parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="{height}" viewBox="0 0 1440 {height}" role="img" aria-labelledby="title desc">',
   f'<title id="title">{escape(title)}</title><desc id="desc">{escape(subtitle)}</desc>',
   '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#697488"/></marker></defs>',
   f'<rect width="1440" height="{height}" fill="{C["bg"]}"/>',
   f'<rect x="0" y="0" width="1440" height="9" fill="{C["brand"]}"/>']
  self.text(52, 53, f'ALL ABOARD VA  /  ARCHITECTURE {number:02}', 17, C['brand'], 700)
  self.text(52, 105, title, 36, C['ink'], 700)
  self.text(52, 142, subtitle, 21, C['muted'])
 def text(self, x, y, value, size=21, color=None, weight=400, anchor='start'):
  self.parts.append(f'<text x="{x}" y="{y}" font-family="Arial, Helvetica, sans-serif" font-size="{size}" font-weight="{weight}" fill="{color or C["ink"]}" text-anchor="{anchor}">{escape(str(value))}</text>')
 def rect(self,x,y,w,h,fill,stroke=None,r=18):
  self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke or fill}"/>')
 def icon(self,x,y,name,tone):
  self.rect(x,y,46,46,PALE[tone],r=12)
  self.parts.append(f'<g transform="translate({x+7},{y+7})" stroke="{C[tone]}" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{ICONS[name]}</g>')
 def card(self,x,y,w,h,title,lines,tone='blue',icon='document',size=21):
  self.rect(x,y,w,h,C['white'],C['line'])
  self.rect(x,y,6,h,C[tone],r=3)
  self.icon(x+22,y+20,icon,tone)
  self.text(x+82,y+50,title,min(24, (w-104)/(len(title)*.55)),C[tone],700)
  ty=y+96
  for line in lines:
   for part in textwrap.wrap(line, width=int((w-48)/(size*.51))) or ['']:
    self.text(x+24,ty,part,size)
    ty+=29
  if ty-29 > y+h-15:
   raise ValueError(f'Card text exceeds height: {title} ({ty} vs {y+h})')
 def path(self,points,label=None,lx=None,ly=None,dashed=False):
  d='M'+' L'.join(f'{x},{y}' for x,y in points)
  dash=' stroke-dasharray="8 7"' if dashed else ''
  self.parts.append(f'<path d="{d}" fill="none" stroke="#697488" stroke-width="2.5" stroke-linejoin="round"{dash} marker-end="url(#arrow)"/>')
  if label:
   width = len(label)*9.5+20
   self.rect(lx-width/2,ly-20,width,28,C['bg'],r=6)
   self.text(lx,ly,label,18,C['muted'],600,'middle')
 def footer(self, text):
  self.text(52,self.height-25,text,18,C['muted'])
 def save(self):
  self.parts.append('</svg>')
  OUT.mkdir(parents=True,exist_ok=True)
  (OUT/self.name).write_text('\n'.join(self.parts)+'\n')


def runtime():
 d=Diagram('runtime.svg',1080,'The site runs on Vercel. Commerce lives in Shopify.',
  'Astro renders the experience; server-side APIs connect customers to commerce and email.',1)
 d.card(52,210,310,205,'Customer browser',['Browse pages','Boards, tours and gifts','Cart edits and forms'],'blue','browser',20)
 d.rect(462,190,465,445,PALE['purple'],r=22)
 d.icon(485,210,'triangle','purple');d.text(546,240,'Vercel · Astro + TypeScript',25,C['purple'],700)
 d.card(485,285,419,145,'Pages + shared UI',['HTML, CSS and browser scripts','Server-rendered Shopify content'],'purple','browser',20)
 d.card(485,455,419,155,'Server-side endpoints',['Cart, delivery and tour booking','Request email, cron and webhooks'],'purple','server',20)
 d.rect(1047,190,341,445,PALE['green'],r=22)
 d.icon(1070,210,'bag','green');d.text(1130,240,'Shopify',27,C['green'],700)
 d.card(1070,285,295,145,'Storefront API',['Catalog + prices','Inventory + carts'],'green','bag',20)
 d.card(1070,455,295,155,'Admin API',['Settings + inventory','Catalog / inventory sync'],'green','server',20)
 d.path([(362,310),(462,310)],'HTTPS',412,293)
 d.path([(927,355),(1047,355)],'API calls',987,337)
 d.path([(927,530),(1047,530)],'API calls',987,512)
 d.card(52,785,410,210,'Shopify checkout',['Hosted payment and order creation','Gift-card issuance + native emails','Shopify enforces sellable inventory'],'green','bag',20)
 d.card(515,785,410,210,'Resend',['Contact + custom-board requests','Sent to business inboxes','Separate from Shopify gift emails'],'amber','mail',20)
 d.card(978,785,410,210,'Repository content',['Marketing copy, policies, images','Board options and brand styling','Published by a code deployment'],'brand','code',20)
 d.path([(206,415),(206,785)],'Checkout handoff',206,610)
 d.path([(1218,635),(1218,700),(385,700),(385,785)],'Commerce stays in Shopify',480,686)
 d.path([(720,635),(720,785)],'Inquiry email',720,754)
 d.footer('API credentials stay on the server. Customers receive pages, cart identifiers and hosted-checkout links.')
 d.save()


def pages():
 d=Diagram('page-data.svg',1390,'What supplies the content on each page?',
  'Arrows show data flowing from its authoritative source into the Astro page or component.',2)
 d.text(76,198,'AUTHORITATIVE SOURCE',17,C['green'],700)
 d.text(822,198,'CUSTOMER-FACING PAGE / COMPONENT',17,C['purple'],700)
 rows=[
 ('Announcement banners',['Shopify metaobject: announcement_banner','Content + enabled flag + start/end dates'],'calendar',
  'Header on every page',['Shared announcement banner','Fetched via Admin API; 60-second cache']),
 ('Charcuterie catalog',['Collection + products + variants + images','Product metafields: servings, ingredients, allergens'],'bag',
  'Menu + product pages',['/charcuterie-menu and /charcuterie-menu/p/*','Prices, choices, images and product descriptions']),
 ('Native gift-card product',['Shopify denominations + charcuterie prices','Tour price settings: tour_schedule/default'],'gift',
  'Gift Cards',['/gift-certificates → native product page','Amount selector + automatic price examples']),
 ('Tours + shared closures',['tour_schedule/default + booking_blackouts/default','Dated seat/bus products: prices + live inventory'],'calendar',
  'Planner + tour booking',['/experiences planner → /booking','Live calendar, seat availability and checkout']),
 ('Delivery + shared closures',['delivery_schedule/default + booking_blackouts/default','No reservation inventory or capacity limits'],'clock',
  'Cart delivery scheduling',['/cart → /api/delivery/availability','ZIP eligibility, dates, windows and blackouts']),
 ('Files in this repository',['src/pages, src/data and public/images','Policies, copy, featured boards, ingredient choices'],'code',
  'Marketing + local content',['Homepage, About, guides, FAQ and form wording','Homepage featured-board copy is curated in code']),
 ]
 for i,(st,sl,icon,pt,pl) in enumerate(rows):
  y=228+i*178
  tone='brand' if i==5 else 'green'
  d.card(52,y,610,146,st,sl,tone,icon,19)
  d.card(778,y,610,146,pt,pl,'purple','browser',19)
  d.path([(662,y+73),(778,y+73)],'data',720,y+57)
 d.footer('Dynamic prices update from Shopify without a code deployment. Repository-owned copy and layout require deployment.')
 d.save()


def automation():
 d=Diagram('shopify-automation.svg',1320,'Scheduled jobs keep Shopify ready for bookings.',
  'Vercel Cron runs on Production. Signed Shopify webhooks keep on-tour boards synchronized.',3)
 d.card(52,192,610,166,'Delivery settings',['delivery_schedule/default','Shared closures: booking_blackouts/default'],'green','calendar')
 d.card(778,192,610,166,'Tour settings + board catalog',['tour_schedule/default + shared closures','Published charcuterie products and source variants'],'green','bag')
 d.path([(357,358),(357,431)],'read via Admin API',357,403)
 d.path([(1083,358),(1083,431)],'read via Admin API',1083,403)
 d.card(52,431,610,242,'Delivery availability + checkout',['On request · /api/delivery/availability','Read schedule and shared blackout dates','Validate ZIP, notice, horizon and windows','Keep customer window selection available'],'purple','clock',20)
 d.card(778,431,610,242,'Daily tour reconciliation',['03:00 UTC · /api/cron/materialize-tours','Create / update seats and whole-bus bundles','Archive dates outside the active schedule','After completed tour sync: sync on-tour boards'],'purple','clock',20)
 d.path([(357,673),(357,754)],'write via Storefront API',357,717)
 d.path([(1083,673),(1083,754)],'write via Admin API',1083,717)
 d.card(52,754,610,177,'Shopify board order lines',['Date and window saved on physical board lines','Cart metadata plus visible line properties','No reservation products added at checkout'],'green','bag',20)
 d.card(778,754,610,177,'Shopify tour products + variants',['Dated seats; bus bundle uses all 10 seats','On-tour board variants mirror delivery prices','On-tour boards do not require shipping'],'green','bag',20)
 d.rect(52,994,1336,247,PALE['green'],r=22)
 d.text(77,1034,'EVENT-DRIVEN SYNC · /api/shopify/webhooks',20,C['green'],700)
 d.card(77,1065,373,160,'Shopify events',['products/create, products/update','collections/update'],'green','event',18)
 d.card(537,1065,373,160,'Verify + reconcile',['Validate HMAC + store identity','Sync affected product / collection'],'purple','check',18)
 d.card(997,1065,366,160,'On-tour variants',['Mirror prices, options and tax','Retain source links + variant IDs'],'green','bag',18)
 d.path([(450,1136),(537,1136)])
 d.path([(910,1136),(997,1136)])
 d.footer('Cron endpoints require CRON_SECRET. Schedule edits do not cancel orders; sync does not reset sold inventory.')
 d.save()


def deployments():
 d=Diagram('deployments.svg',1150,'GitHub checks changes. Vercel deploys the site.',
  'Branch pushes create Preview deployments; merging into main triggers Production.',4)
 d.card(52,205,330,165,'Local changes',['Astro + TypeScript + assets','Commit and push a branch'],'brand','code',20)
 d.card(552,205,330,165,'GitHub branch + PR',['PR targets main','Each commit has its own SHA'],'blue','branch',20)
 d.card(1052,205,336,165,'Vercel Preview',['Vercel builds branch pushes','PR bot links to the preview'],'purple','triangle',20)
 d.path([(382,287),(552,287)],'git push',467,269)
 d.path([(882,287),(1052,287)],'Git integration',967,269)
 d.card(52,465,330,360,'Independent systems',['GitHub Actions checks quality.','It does not publish the site.','','Vercel builds and hosts it.','Its deployment status is a','separate required review item.'],'brand','document',19)
 d.card(552,465,330,210,'Catalog parity check',['GitHub Actions workflow','Tests + production build','Shopify catalog comparison','Internal-link crawl'],'blue','check',19)
 d.card(1052,465,336,210,'Preview review',['Check affected pages and forms','Confirm latest PR commit','Check the Vercel Ready status'],'purple','browser',19)
 d.path([(717,370),(717,465)],'PR / merge-group event',717,424)
 d.path([(1220,370),(1220,465)],'open preview',1220,424)
 d.card(552,790,330,150,'Review + merge',['Both checks pass; approve PR','Merge into main'],'blue','branch',19)
 d.card(1052,790,336,150,'Vercel Production',['Build the merged main commit','Publish the production site'],'purple','triangle',19)
 d.path([(717,675),(717,790)],'check passes',717,734)
 d.path([(1220,675),(1220,735),(858,735),(858,790)])
 d.path([(882,865),(1052,865)],'Git integration',967,847)
 d.rect(52,1000,1336,91,PALE['amber'],r=15)
 d.text(76,1037,'Environment settings: configure Vercel Preview and Production separately. GitHub Actions has its own credentials.',20,C['amber'],600)
 d.text(76,1070,'A Preview can use the same Shopify store or email service as Production; isolation depends on configured credentials.',20,C['ink'])
 d.footer('Daily Vercel Cron runs on Production only. No DNS cutover is implied by a deployment or canonical URL.')
 d.save()

if __name__ == '__main__':
 for diagram in (runtime,pages,automation,deployments):
  diagram()
 print('Rendered 4 architecture SVGs in docs/architecture/.')
