import { activeAnnouncement, defaultAnnouncement } from '../announcement';
import { adminGraphql } from './client';
import { getAdminConfig } from './config';

type Fields = Record<string, string>;
let cached: { fields: Fields; expiresAt: number } | null = null;
let pending: Promise<Fields> | null = null;

async function loadFields(): Promise<Fields> {
  try {
    const result = await adminGraphql<{
      metaobjectByHandle: { fields: Array<{ key: string; value: string }> } | null;
    }>(`query AnnouncementBanner {
      metaobjectByHandle(handle: { type: "announcement_banner", handle: "default" }) {
        fields { key value }
      }
    }`);
    return Object.fromEntries((result.metaobjectByHandle?.fields || []).map(({ key, value }) => [key, value]));
  } catch (error) {
    // An unavailable content service must not take down the storefront or revive an old offer.
    console.error('Unable to load announcement banner:', error instanceof Error ? error.message : 'Unknown error');
    return {};
  }
}

export async function getAnnouncement() {
  if (!getAdminConfig()) return defaultAnnouncement;
  if (!cached || cached.expiresAt <= Date.now()) {
    pending ||= loadFields().then((fields) => {
      cached = { fields, expiresAt: Date.now() + 60_000 };
      return fields;
    }).finally(() => { pending = null; });
    await pending;
  }
  // Evaluate dates on every page request, even when the content is cached.
  return activeAnnouncement(cached!.fields);
}
