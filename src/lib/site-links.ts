const siteHosts = new Set(['allaboardva.com', 'www.allaboardva.com', 'aava-site.vercel.app']);
const canonicalPaths: Record<string, string> = {
  '/custom-board-request-form': '/custom-board-request',
  '/charcuterie-menu/build-your-own-boards': '/charcuterie-menu/build-your-own',
  '/terms': '/terms-conditions',
  '/gift': '/gift-certificates',
};

// Content edited in Shopify may still contain full URLs from the previous site.
export function siteRelativeHref(value: string): string {
  if (!/^(?:https?:\/\/|\/)/i.test(value)) return value;
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value, 'https://www.allaboardva.com');
    if (!['http:', 'https:'].includes(url.protocol) || !siteHosts.has(url.hostname.toLowerCase())) return value;
    const pathname = canonicalPaths[url.pathname] || url.pathname;
    const path = pathname === '/experiences' && url.hash === '#choose-region'
      ? pathname + url.search + '#plan-tour'
      : pathname + url.search + url.hash;
    return path;
  } catch { return value; }
}

export function relativeSiteLinks(html: string): string {
  return html.replace(/(<a\b[^>]*?\bhref\s*=\s*)(?:(["'])(.*?)\2|([^\s>]+))/gi,
    (_match, prefix, quote, quoted, unquoted) => `${prefix}${quote || ''}${siteRelativeHref(quoted ?? unquoted)}${quote || ''}`);
}
