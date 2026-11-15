import type { LineAttribute } from './board-customization';

export const GIFT_CARD_MESSAGE_LIMIT = 200;
export const GIFT_CARD_NAME_LIMIT = 255;
export const GIFT_CARD_SCHEDULE_DAYS = 90;

export function giftCardDateRange(offset: number, now = new Date()) {
  const local = new Date(now.getTime() - offset * 60_000);
  const min = local.toISOString().slice(0, 10);
  local.setUTCDate(local.getUTCDate() + GIFT_CARD_SCHEDULE_DAYS);
  return { min, max: local.toISOString().slice(0, 10) };
}

export function giftCardAttributes(isGiftCard: boolean, input: unknown, now = new Date()): LineAttribute[] {
  if (input == null) return [];
  if (!isGiftCard) throw new Error('Recipient details can only be added to a gift card.');
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('Enter the gift card recipient details.');
  const details = input as Record<string, unknown>;
  const text = (key: string, max: number) => {
    const value = details[key] ?? '';
    if (typeof value !== 'string' || value.length > max) throw new Error(`Gift card ${key} must be ${max} characters or fewer.`);
    return value.trim();
  };
  const email = text('email', 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid recipient email address.');
  const name = text('name', GIFT_CARD_NAME_LIMIT);
  const message = text('message', GIFT_CARD_MESSAGE_LIMIT);
  const sendOn = text('sendOn', 10);
  const offset = details.offset;
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < -840 || offset > 720) {
    throw new Error('Your timezone could not be determined. Reload the page and try again.');
  }
  if (sendOn) {
    const date = new Date(`${sendOn}T00:00:00Z`);
    const { min, max } = giftCardDateRange(offset, now);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sendOn) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== sendOn || sendOn < min || sendOn > max) {
      throw new Error(`Choose a send date from today through ${GIFT_CARD_SCHEDULE_DAYS} days from today.`);
    }
  }
  return [
    { key: '__shopify_send_gift_card_to_recipient', value: 'true' },
    { key: 'Recipient email', value: email },
    ...(name ? [{ key: 'Recipient name', value: name }] : []),
    ...(message ? [{ key: 'Message', value: message }] : []),
    ...(sendOn ? [{ key: 'Send on', value: sendOn }] : []),
    { key: '__shopify_offset', value: String(offset) },
  ];
}

export function assertGiftCardLine(isGiftCard: boolean, attributes: LineAttribute[], now = new Date()) {
  const details = Object.fromEntries(attributes.map(({ key, value }) => [key, value]));
  if (!details.__shopify_send_gift_card_to_recipient) return;
  giftCardAttributes(isGiftCard, {
    email: details['Recipient email'], name: details['Recipient name'], message: details.Message,
    sendOn: details['Send on'], offset: details.__shopify_offset === undefined ? undefined : Number(details.__shopify_offset),
  }, now);
}
