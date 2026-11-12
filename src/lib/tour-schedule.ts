export const TOUR_TIMEZONE = 'America/New_York';
export const TOUR_TAG = 'scheduled-tour';
export const TOUR_CAPACITY = 10;
export interface TourSchedule {
  enabled: boolean;
  minimumDays: number;
  monthsAhead: number;
  operatingDays: number[];
  blackoutDates: string[];
  seatPrice: string;
  busPrice: string;
}
export function localTourDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TOUR_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const last = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 + months, Math.min(day, last), 12)).toISOString().slice(0, 10);
}
export function validTourDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
}
export function parseTourSchedule(fields: Record<string, string>): TourSchedule {
  const integer = (key: string, min: number, max: number) => {
    const value = Number(fields[key]);
    if (!fields[key] || !Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid tour schedule ${key}.`);
    return value;
  };
  const price = (key: string) => {
    const value = fields[key] || '';
    if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) <= 0) throw new Error(`Invalid tour schedule ${key}.`);
    return Number(value).toFixed(2);
  };
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const days = JSON.parse(fields.operating_days || '[]');
  if (!Array.isArray(days) || days.some(day => !weekdays.includes(day))) throw new Error('Invalid tour operating days.');
  const blackoutDates = [...new Set((fields.blackout_dates || '').split(/[\s,]+/).filter(Boolean))];
  if (blackoutDates.some(date => !validTourDate(date))) throw new Error('Invalid tour blackout date. Use YYYY-MM-DD, one per line.');
  if (!['true', 'false'].includes(fields.enabled)) throw new Error('Invalid tour enabled switch.');
  const schedule = {
    enabled: fields.enabled === 'true', minimumDays: integer('minimum_days', 1, 365),
    monthsAhead: integer('months_ahead', 1, 12), operatingDays: [...new Set(days.map(day => weekdays.indexOf(day)))],
    blackoutDates, seatPrice: price('seat_price'), busPrice: price('bus_price'),
  };
  return schedule;
}
export function eligibleTourDates(config: TourSchedule, now = new Date()): string[] {
  if (!config.enabled) return [];
  const today = localTourDate(now);
  const last = addMonths(today, config.monthsAhead);
  const dates: string[] = [];
  const blocked = new Set(config.blackoutDates);
  for (let date = addDays(today, config.minimumDays); date <= last; date = addDays(date, 1)) {
    if (!blocked.has(date) && config.operatingDays.includes(new Date(`${date}T12:00:00Z`).getUTCDay())) dates.push(date);
  }
  return dates;
}
export function tourHandle(kind: 'seat' | 'bus', date: string): string {
  return `tour-${kind}-${date}`;
}
export function managedTourDate(handle: string): string | null {
  const match = /^tour-(?:seat|bus)-(\d{4}-\d{2}-\d{2})$/.exec(handle);
  return match && validTourDate(match[1]) ? match[1] : null;
}
