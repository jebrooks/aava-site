export const BLACKOUT_TYPE = 'booking_blackouts';
export const BLACKOUT_HANDLE = 'default';
export const BLACKOUT_SOURCE = `${BLACKOUT_TYPE}/${BLACKOUT_HANDLE}`;

// Multiline text allows more dates than Shopify's fixed-length list fields.
export function parseBlackoutDates(value: string | null | undefined): string[] {
  const raw = value?.trim() || '';
  let values: unknown[];
  if (raw.startsWith('[')) {
    try { values = JSON.parse(raw); } catch { throw new Error('Invalid blackout dates. Use YYYY-MM-DD, one per line.'); }
    if (!Array.isArray(values)) throw new Error('Invalid blackout date list.');
  } else values = raw.split(/[\s,]+/).filter(Boolean);
  const dates = values.map(date => {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
      throw new Error('Invalid blackout date. Use YYYY-MM-DD, one per line.');
    return date;
  });
  return [...new Set(dates)].sort();
}
