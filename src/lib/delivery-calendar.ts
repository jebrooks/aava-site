import type { DeliverySlot } from './shopify/types';

// Use UTC calendar arithmetic; API dates already represent Eastern delivery dates.
export function deliveryCalendarMonth(slots: DeliverySlot[], month: string, selectedDate = '') {
  const availableDates = [...new Set(slots.filter(slot => slot.available).map(slot => slot.date))].sort();
  const available = new Set(availableDates);
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const offset = first.getUTCDay();
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    label: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first),
    hasPrevious: !!availableDates.length && month > availableDates[0].slice(0, 7),
    hasNext: !!availableDates.length && month < availableDates.at(-1)!.slice(0, 7),
    days: Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
      const number = index - offset + 1;
      if (number < 1 || number > count) return null;
      const date = `${month}-${String(number).padStart(2, '0')}`;
      return { date, available: available.has(date), selected: date === selectedDate };
    }),
  };
}
