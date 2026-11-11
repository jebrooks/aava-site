import { selectAnnouncement, defaultAnnouncement, type AnnouncementEntry } from '../announcement';
import { adminGraphql } from './client';
import { getAdminConfig } from './config';

let cached: { entries: AnnouncementEntry[]; expiresAt: number } | null = null;
let pending: Promise<AnnouncementEntry[]> | null = null;

interface BannerPage {
  metaobjects: {
    nodes: Array<{
      handle: string;
      updatedAt: string;
      fields: Array<{ key: string; value: string | null }>;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

async function loadEntries(): Promise<AnnouncementEntry[]> {
  try {
    const entries: AnnouncementEntry[] = [];
    let after: string | null = null;
    do {
      const result: BannerPage = await adminGraphql<BannerPage>(`query AnnouncementBanners($after: String) {
        metaobjects(type: "announcement_banner", first: 100, after: $after) {
          nodes { handle updatedAt fields { key value } }
          pageInfo { hasNextPage endCursor }
        }
      }`, { after });
      entries.push(...result.metaobjects.nodes.map(({ handle, updatedAt, fields }) => ({
        handle, updatedAt,
        fields: Object.fromEntries(fields.map(({ key, value }) => [key, value || ''])),
      })));
      after = result.metaobjects.pageInfo.hasNextPage ? result.metaobjects.pageInfo.endCursor : null;
    } while (after);
    return entries;
  } catch (error) {
    // An unavailable content service must not take down the storefront or revive an old offer.
    console.error('Unable to load announcement banner:', error instanceof Error ? error.message : 'Unknown error');
    return [];
  }
}

export async function getAnnouncement() {
  if (!getAdminConfig()) return defaultAnnouncement;
  if (!cached || cached.expiresAt <= Date.now()) {
    pending ||= loadEntries().then((entries) => {
      cached = { entries, expiresAt: Date.now() + 60_000 };
      return entries;
    }).finally(() => { pending = null; });
    await pending;
  }
  // Evaluate dates on every page request, even when the content is cached.
  return selectAnnouncement(cached!.entries);
}
