export interface Announcement {
  message: string;
  linkLabel: string;
  linkUrl: string;
}

export interface AnnouncementEntry {
  handle: string;
  updatedAt: string;
  fields: Record<string, string>;
}

export function selectAnnouncement(entries: AnnouncementEntry[], now = new Date()): Announcement | null {
  const eligible = entries.flatMap((entry) => {
    const announcement = activeAnnouncement(entry.fields, now);
    return announcement ? [{ entry, announcement }] : [];
  });
  eligible.sort((a, b) =>
    (b.entry.fields.start_date || '').localeCompare(a.entry.fields.start_date || '') ||
    b.entry.updatedAt.localeCompare(a.entry.updatedAt) ||
    a.entry.handle.localeCompare(b.entry.handle),
  );
  return eligible[0]?.announcement || null;
}

// Used only for local development without Shopify credentials.
export const defaultAnnouncement: Announcement = {
  message: 'Celebrate Women-Owned Businesses — nominate one you love and receive $20 off your next order.',
  linkLabel: 'Order now',
  linkUrl: '/charcuterie',
};

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
}

export function activeAnnouncement(
  fields: Record<string, string>,
  now = new Date(),
): Announcement | null {
  const message = fields.message?.trim();
  if (fields.enabled !== 'true' || !message) return null;

  const start = fields.start_date || '';
  const end = fields.end_date || '';
  if ((start && !validDate(start)) || (end && !validDate(end)) || (start && end && start > end)) {
    return null;
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  if ((start && today < start) || (end && today > end)) return null;

  const linkUrl = fields.link_url?.trim() || '';
  // Allow internal paths and HTTPS links, including protection against URL normalization.
  const safeLink = /^\/(?!\/)/.test(linkUrl) && !/[\\\s\u0000-\u001f]/.test(linkUrl);
  let externalLink = false;
  try {
    externalLink = new URL(linkUrl).protocol === 'https:';
  } catch { /* Relative paths are handled above. */ }
  return {
    message,
    linkLabel: fields.link_label?.trim() || '',
    linkUrl: safeLink || externalLink ? linkUrl : '',
  };
}
