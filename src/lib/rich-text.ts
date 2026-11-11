export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

export function safeRichTextUrl(value: string): boolean {
  if (/[\\\u0000-\u0020\u007f]/.test(value)) return false;
  if (/^\/(?!\/)/.test(value)) return true;
  try { return ['https:', 'http:', 'mailto:', 'tel:'].includes(new URL(value).protocol); }
  catch { return false; }
}

// Shopify rich text is structured JSON. Only these elements and attributes become HTML.
export function renderRichText(value: string): string | null {
  try {
    const root = JSON.parse(value);
    if (root?.type !== 'root' || !Array.isArray(root.children)) return null;
    let hasText = false;
    function render(node: unknown, depth = 0, inLink = false): string {
      if (depth > 30 || !node || typeof node !== 'object') return '';
      const item = node as Record<string, unknown>;
      if (item.type === 'text') {
        if (typeof item.value !== 'string') return '';
        if (item.value.trim()) hasText = true;
        let text = escapeHtml(item.value).replace(/\n/g, '<br>');
        if (item.bold === true) text = `<strong>${text}</strong>`;
        if (item.italic === true) text = `<em>${text}</em>`;
        return text;
      }
      if (!['root', 'paragraph', 'heading', 'list', 'list-item', 'link'].includes(String(item.type))) return '';
      const children = Array.isArray(item.children)
        ? item.children.map((child) => render(child, depth + 1, inLink || item.type === 'link')).join('') : '';
      switch (item.type) {
        case 'root': return children;
        case 'paragraph': return `<p>${children || '<br>'}</p>`;
        case 'heading': {
          const level = Number(item.level);
          return Number.isInteger(level) && level >= 1 && level <= 6 ? `<h${level}>${children}</h${level}>` : children;
        }
        case 'list': return item.listType === 'ordered' ? `<ol>${children}</ol>` : `<ul>${children}</ul>`;
        case 'list-item': return `<li>${children}</li>`;
        case 'link': {
          if (inLink || typeof item.url !== 'string' || !safeRichTextUrl(item.url)) return children;
          const title = typeof item.title === 'string' ? ` title="${escapeHtml(item.title)}"` : '';
          const target = item.target === '_blank' ? ' target="_blank" rel="noopener noreferrer"' : '';
          return `<a href="${escapeHtml(item.url)}"${title}${target}>${children}</a>`;
        }
        default: return '';
      }
    }
    const html = render(root);
    return hasText ? html : null;
  } catch { return null; }
}
