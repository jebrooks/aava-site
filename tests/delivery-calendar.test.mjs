import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryCalendarMonth } from '../src/lib/delivery-calendar.ts';

test('calendar only enables API-available dates, keeping closures, notice and horizon disabled', () => {
 const slots=[{date:'2026-11-22',available:true},{date:'2026-11-22',available:true},{date:'2026-11-24',available:true},{date:'2026-11-25',available:false},{date:'2026-12-01',available:true}];
 const month=deliveryCalendarMonth(slots,'2026-11','2026-11-24');
 assert.equal(month.label,'November 2026');
 assert.deepEqual(month.days.filter(day=>day?.available).map(day=>day.date),['2026-11-22','2026-11-24']);
 assert.deepEqual(month.days.filter(day=>day?.selected).map(day=>day.date),['2026-11-24']);
 assert.equal(month.hasPrevious,false);
 assert.equal(month.hasNext,true);
 assert.equal(deliveryCalendarMonth(slots,'2026-12').hasNext,false);
 assert.equal(deliveryCalendarMonth(slots,'2026-12').hasPrevious,true);
});

test('calendar aligns weekday cells and handles leap days and year boundaries', () => {
 const leap=deliveryCalendarMonth([{date:'2028-02-29',available:true}],'2028-02');
 assert.equal(leap.days[0],null);
 assert.equal(leap.days[2].date,'2028-02-01');
 assert.equal(leap.days.filter(Boolean).length,29);
 assert.ok(leap.days.find(day=>day?.date==='2028-02-29').available);
 const slots=[{date:'2026-12-31',available:true},{date:'2027-01-01',available:true}];
 assert.equal(deliveryCalendarMonth(slots,'2026-12').hasNext,true);
 assert.equal(deliveryCalendarMonth(slots,'2027-01').hasPrevious,true);
 assert.ok(deliveryCalendarMonth([],'2027-01').days.filter(Boolean).every(day=>!day.available));
});
