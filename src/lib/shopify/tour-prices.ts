import { adminGraphql } from './client';
import { parseTourSchedule, type TourSchedule } from '../tour-schedule';

export interface TourPrices extends Pick<TourSchedule, 'enabled' | 'seatPrice' | 'busPrice'> {
  currencyCode: string;
}

export async function getTourPrices(): Promise<TourPrices | null> {
  const data = await adminGraphql<{
    shop: { currencyCode: string };
    metaobjectByHandle: { fields: Array<{ key: string; value: string | null }> } | null;
  }>(`query TourPrices {
    shop { currencyCode }
    metaobjectByHandle(handle: { type: "tour_schedule", handle: "default" }) { fields { key value } }
  }`);
  if (!data.metaobjectByHandle) return null;
  const schedule = parseTourSchedule(Object.fromEntries(
    data.metaobjectByHandle.fields.map(field => [field.key, field.value || '']),
  ));
  return { enabled: schedule.enabled, seatPrice: schedule.seatPrice, busPrice: schedule.busPrice,
    currencyCode: data.shop.currencyCode };
}
