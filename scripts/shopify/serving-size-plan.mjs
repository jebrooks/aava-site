// Derive counts only from explicit existing serving statements, never from S/M/L labels.
export function explicitCounts(text = '') {
  return [...new Set([...text.matchAll(/\bserves\s*~?\s*(\d+)(?![\d–-])/gi)].map(match => Number(match[1])))];
}

export function cleanServingText(text) {
  return text
    .replace(/\s*\(\s*serves\s*~?\s*\d+\s*\)/gi, '')
    .replace(/\s*[-–—]\s*serves\s*~?\s*\d+(?=\s*\))/gi, '')
    .replace(/\bserves\s*~?\s*\d+\.?\s*/gi, '')
    .trim();
}

export function servingSizePlan(product) {
  if (product.productType !== 'Charcuterie' || product.tags.includes('scheduled-tour') ||
    product.tags.includes('delivery-slot') || product.variants.pageInfo.hasNextPage) {
    throw new Error(`${product.handle}: unsupported product or incomplete variant list.`);
  }
  const productCounts = explicitCounts(`${product.title} ${product.description}`);
  const variants = product.variants.nodes.map(variant => {
    const counts = explicitCounts(variant.selectedOptions.map(option => option.value).join(' '));
    if (counts.length > 1) throw new Error(`${product.handle}: ambiguous variant serving count.`);
    const count = counts[0] || (productCounts.length === 1 ? productCounts[0] : null);
    if (!count || !Number.isSafeInteger(count)) throw new Error(`${product.handle}: no unambiguous count for ${variant.id}.`);
    if (variant.servingCount?.value && variant.servingCount.value !== String(count)) {
      throw new Error(`${product.handle}: existing variant serving field conflicts with copy.`);
    }
    return { id: variant.id, count, current: variant.servingCount };
  });
  const counts = [...new Set(variants.map(variant => variant.count))];
  if (product.servingCount?.value && (counts.length !== 1 || product.servingCount.value !== String(counts[0]))) {
    throw new Error(`${product.handle}: existing product serving field conflicts with variant counts.`);
  }
  const options = product.options.flatMap(option => {
    const values = option.optionValues.map(value => ({ id: value.id, name: cleanServingText(value.name) }));
    if (new Set(values.map(value => value.name)).size !== values.length || values.some(value => !value.name)) {
      throw new Error(`${product.handle}: cleaning option names would merge choices.`);
    }
    const changed = values.filter((value, i) => value.name !== option.optionValues[i].name);
    return changed.length ? [{ id: option.id, values: changed }] : [];
  });
  // Counts belong on a product only when it has one serving size; on every variant otherwise.
  const metafields = counts.length === 1 ? [{ ownerId: product.id, value: String(counts[0]), current: product.servingCount }]
    : variants.map(variant => ({ ownerId: variant.id, value: String(variant.count), current: variant.current }));
  return { id: product.id, handle: product.handle, before: product,
    title: cleanServingText(product.title), descriptionHtml: cleanServingText(product.descriptionHtml),
    options, metafields, counts };
}
