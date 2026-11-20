interface ServingField { value: string }
interface ServingSource { servingCount?: ServingField | null }
interface ServingVariant extends ServingSource { availableForSale?: boolean }

export function servingCount(product: ServingSource, variant?: ServingSource): number | null {
  const value = (variant?.servingCount?.value || product.servingCount?.value || '').trim();
  if (!/^\d+$/.test(value)) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count > 0 ? count : null;
}

export function productServingLabel(product: ServingSource & { variants: { nodes: ServingVariant[] } }): string {
  const counts = [...new Set(product.variants.nodes.map(variant => servingCount(product, variant))
    .filter((count): count is number => count !== null))].sort((a, b) => a - b);
  if (!counts.length) {
    const count = servingCount(product);
    return count ? `Serves ${count}` : '';
  }
  return `Serves ${counts.length === 2 ? counts.join(' or ') : counts.join(', ')}`;
}

export function servingAttributes(product: ServingSource, variant?: ServingSource) {
  const count = servingCount(product, variant);
  return count ? [{ key: 'Serves', value: String(count) }] : [];
}

export function variantServingLabel(product: ServingSource, variant: ServingSource & { title: string }): string {
  const count = servingCount(product, variant);
  // Avoid repeating the old option suffix during the staged catalog migration.
  const title = count ? variant.title.replace(/\s*\(\s*serves\s*~?\s*\d+\s*\)/gi, '') : variant.title;
  return `${title === 'Default Title' ? 'Standard board' : title}${count ? ` — serves ${count}` : ''}`;
}
