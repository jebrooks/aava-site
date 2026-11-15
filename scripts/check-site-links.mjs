import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const decode = value => value.replaceAll('&amp;','&').replaceAll('&#39;',"'").replaceAll('&quot;','"');
export async function checkSiteLinks(base = 'http://127.0.0.1:4330', request = fetch) {
  const origin = new URL(base).origin;
  const pages = new Map();
  const links = [];
  const failures = [];
  let queued = new Set(['/', '/terms', '/gift', '/winery-experience-selector-tool'].map(path=>origin+path));
  while (queued.size) {
    const batch = [...queued].filter(url=>!pages.has(url));queued = new Set();
    if (pages.size + batch.length > 300) throw new Error('Internal link crawl exceeded 300 pages.');
    for (let start=0;start<batch.length;start+=5) {
      const results=await Promise.allSettled(batch.slice(start,start+5).map(async url=>{
        const response=await request(url,{signal:AbortSignal.timeout(30_000)});
        const html=await response.text();return {url,status:response.status,html};
      }));
      for(let i=0;i<results.length;i++) {
        const result=results[i];const url=batch[start+i];
        if(result.status==='rejected'){pages.set(url,{ids:new Set()});failures.push(`${url}: ${result.reason.message}`);continue;}
        const {status,html}=result.value;const ids=new Set([...html.matchAll(/\bid=["']([^"']+)["']/gi)].map(match=>decode(match[1])));
        pages.set(url,{ids});if(status!==200)failures.push(`${url}: HTTP ${status}`);
        for(const match of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:["']([^"']*)["']|([^\s>]+))/gi)) {
          const href=decode(match[1]??match[2]);if(!href)continue;
          let target;try{target=new URL(href,url);}catch{failures.push(`${url}: invalid link ${href}`);continue;}
          if(/^(?:https?:)?\/\//i.test(href) && (target.origin===origin || ['allaboardva.com','www.allaboardva.com','aava-site.vercel.app'].includes(target.hostname)))failures.push(`${url}: absolute internal link ${href}`);
          if(target.origin!==origin)continue;
          const fragment=target.hash.slice(1);target.hash='';const destination=target.toString();
          links.push({source:url,destination,fragment});if(!pages.has(destination))queued.add(destination);
        }
      }
    }
  }
  for(const link of links) {
    if(link.fragment&&!pages.get(link.destination)?.ids.has(decodeURIComponent(link.fragment)))failures.push(`${link.source}: missing anchor ${link.destination}#${link.fragment}`);
  }
  if(failures.length)throw new Error([...new Set(failures)].join('\n'));
  return `Checked ${pages.size} pages and ${links.length} internal links: no broken links or absolute internal URLs.`;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  checkSiteLinks(process.argv[2]||process.env.SITE_CHECK_URL).then(console.log).catch(error=>{console.error(error.message);process.exitCode=1;});
}
