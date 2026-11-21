import { loadSharedBlackoutDates } from './blackouts';
import { BLACKOUT_SOURCE } from '../blackout-dates';
import { adminGraphql, ShopifyApiError } from './client';
import type { DeliveryScheduleConfig, DeliverySlot, DeliveryWindow } from './types';

const SCHEDULE_TIMEZONE = 'America/New_York' as const;
function parseStringList(value: string | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // Accept comma/newline separated values as a staff-friendly fallback.
  }
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function validateWindow(window: unknown): window is DeliveryWindow {
  if (!window || typeof window !== 'object') return false;
  const candidate = window as Record<string, unknown>;
  return (
    typeof candidate.label === 'string' &&
    /^\d{2}:\d{2}$/.test(String(candidate.start)) &&
    /^\d{2}:\d{2}$/.test(String(candidate.end)) &&
    String(candidate.start) < String(candidate.end)
  );
}

function validateSchedule(value: unknown): DeliveryScheduleConfig {
  if (!value || typeof value !== 'object') {
    throw new ShopifyApiError('Delivery schedule configuration is invalid.', 500);
  }

  const candidate = value as Partial<DeliveryScheduleConfig>;
  const eligibleZips = Array.isArray(candidate.eligibleZips)
    ? candidate.eligibleZips.map((zip) => String(zip).trim())
    : [];
  if (
    !eligibleZips.length ||
    eligibleZips.some((zip) => !/^\d{5}$/.test(zip)) ||
    new Set(eligibleZips).size !== eligibleZips.length ||
    !Number.isInteger(candidate.leadTimeHours) ||
    Number(candidate.leadTimeHours) < 0 ||
    !Number.isInteger(candidate.horizonDays) ||
    Number(candidate.horizonDays) < 1 ||
    Number(candidate.horizonDays) > 90 ||
    !candidate.weeklyWindows ||
    typeof candidate.weeklyWindows !== 'object'
  ) {
    throw new ShopifyApiError('Delivery schedule configuration is incomplete.', 500);
  }

  for (const windows of Object.values(candidate.weeklyWindows)) {
    if (!Array.isArray(windows) || !windows.every(validateWindow)) {
      throw new ShopifyApiError('A delivery time window is invalid.', 500);
    }
  }

  return {
    timezone: SCHEDULE_TIMEZONE,
    eligibleZips,
    leadTimeHours: Number(candidate.leadTimeHours),
    horizonDays: Number(candidate.horizonDays),
    blackoutDates: [],
    weeklyWindows: candidate.weeklyWindows,
  };
}

function configFromEnvironment() {
  const raw = import.meta.env.DELIVERY_SCHEDULE_JSON;
  if (!raw) return null;
  try {
    return validateSchedule(JSON.parse(raw));
  } catch (error) {
    if (error instanceof ShopifyApiError) throw error;
    throw new ShopifyApiError('DELIVERY_SCHEDULE_JSON is not valid JSON.', 500);
  }
}

async function getBaseDeliveryScheduleConfig() {
  try {
    const data = await adminGraphql<{
      metaobjectByHandle: { fields: Array<{ key: string; value: string | null }> } | null;
    }>(`#graphql
      query DeliverySchedule {
        metaobjectByHandle(handle: { type: "delivery_schedule", handle: "default" }) {
          fields { key value }
        }
      }
    `);

    if (data.metaobjectByHandle) {
      const fields = Object.fromEntries(
        data.metaobjectByHandle.fields.map((field) => [field.key, field.value || '']),
      );
      return validateSchedule({
        timezone: SCHEDULE_TIMEZONE,
        eligibleZips: parseStringList(fields.eligible_zips),
        leadTimeHours: Number(fields.lead_time_hours),
        horizonDays: Number(fields.horizon_days),
        blackoutDates: [],
        weeklyWindows: JSON.parse(fields.weekly_windows || '{}'),
      });
    }
  } catch (error) {
    const fallback = configFromEnvironment();
    if (fallback) return fallback;
    throw error;
  }

  const fallback = configFromEnvironment();
  if (fallback) return fallback;
  throw new ShopifyApiError('Create the delivery_schedule/default Shopify metaobject.', 503);
}

export async function getDeliveryScheduleConfig() {
  const [config, blackoutDates] = await Promise.all([
    getBaseDeliveryScheduleConfig(), loadSharedBlackoutDates(adminGraphql),
  ]);
  // Shared-date failures must not be bypassed by the development/environment fallback.
  return { ...config, blackoutDates };
}

export function normalizeZip(value: string) {
  return value.trim().match(/^\d{5}/)?.[0] || '';
}

function localDateString(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHEDULE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function weekday(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function zonedDateTimeToDate(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: SCHEDULE_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const numberPart = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((item) => item.type === type)?.value || 0);
    const displayedAsUtc = Date.UTC(
      numberPart('year'),
      numberPart('month') - 1,
      numberPart('day'),
      numberPart('hour'),
      numberPart('minute'),
    );
    guess -= displayedAsUtc - target;
  }

  return new Date(guess);
}

export function getEligibleDates(config: DeliveryScheduleConfig, now = new Date()) {
  const dates: Array<{ date: string; windows: DeliveryWindow[] }> = [];
  const today = localDateString(now);
  const earliest = now.getTime() + config.leadTimeHours * 60 * 60 * 1000;

  for (let offset = 0; offset < config.horizonDays; offset += 1) {
    const date = addCalendarDays(today, offset);
    if (config.blackoutDates.includes(date)) continue;
    const windows = (config.weeklyWindows[String(weekday(date))] || []).filter(
      (window) => zonedDateTimeToDate(date, window.start).getTime() >= earliest,
    );
    if (windows.length) dates.push({ date, windows });
  }

  return dates;
}

function deliverySlotsForSchedule(config: DeliveryScheduleConfig, now: Date): DeliverySlot[] {
  return getEligibleDates(config, now).flatMap(({ date, windows }) =>
    windows.map((window) => ({ key: `${date}:${window.start}`, date, ...window, available: true })),
  );
}

// Calendar browsing does not approve a ZIP; selection and checkout still require eligibility.
export async function getDeliveryCalendar(now = new Date()) {
  const config = await getDeliveryScheduleConfig();
  return { blackoutSource: BLACKOUT_SOURCE, timezone: config.timezone, slots: deliverySlotsForSchedule(config, now) };
}

export async function getAvailableDeliverySlots(zip: string, now = new Date()) {
  const config = await getDeliveryScheduleConfig();
  const normalizedZip = normalizeZip(zip);
  const eligible = !!normalizedZip && config.eligibleZips.includes(normalizedZip);
  return {
    eligible, blackoutSource: BLACKOUT_SOURCE, timezone: config.timezone,
    slots: eligible ? deliverySlotsForSchedule(config, now) : [] as DeliverySlot[],
  };
}

export async function assertDeliverySlotAvailable(zip: string, slotKey: string, now = new Date()) {
  const availability = await getAvailableDeliverySlots(zip, now);
  const slot = availability.slots.find(
    (candidate) =>
      candidate.key === slotKey && candidate.available,
  );
  if (!availability.eligible) {
    throw new ShopifyApiError('That ZIP code is outside the local-delivery area.', 400);
  }
  if (!slot) {
    throw new ShopifyApiError('That delivery window is no longer available.', 409);
  }
  return slot;
}
