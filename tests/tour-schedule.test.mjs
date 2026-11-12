import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTourSchedule, eligibleTourDates, addMonths, managedTourDate } from '../src/lib/tour-schedule.ts';
const fields = {enabled:'true',minimum_days:'3',months_ahead:'6',operating_days:'["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]',blackout_dates:'',seat_price:'125',bus_price:'1250'};
test('minimum is three inclusive Eastern calendar days and maximum is six calendar months', () => {
  const dates=eligibleTourDates(parseTourSchedule(fields),new Date('2026-11-11T20:00:00Z'));
  assert.equal(dates[0],'2026-11-14');
  assert.equal(dates.at(-1),'2027-05-11');
  assert.ok(!dates.includes('2026-11-13'));
  assert.equal(eligibleTourDates(parseTourSchedule(fields),new Date('2026-11-12T03:00:00Z'))[0],'2026-11-14');
});
test('calendar month arithmetic clamps month ends and leap years', () => {
  assert.equal(addMonths('2026-08-31',6),'2027-02-28');
  assert.equal(addMonths('2027-08-31',6),'2028-02-29');
});
test('blackouts accept any number of newline dates, deduplicate and combine with operating weekdays', () => {
  const config=parseTourSchedule({...fields,operating_days:'["Saturday","Sunday"]',blackout_dates:'2026-11-14\n2026-11-15\n2026-11-15'});
  const dates=eligibleTourDates(config,new Date('2026-11-11T12:00:00Z'));
  assert.equal(dates[0],'2026-11-21');
  assert.equal(config.blackoutDates.length,2);
  assert.equal(parseTourSchedule({...fields,blackout_dates:Array.from({length:500},(_,i)=>new Date(Date.UTC(2027,0,i+1)).toISOString().slice(0,10)).join('\n')}).blackoutDates.length,500);
});
test('disabled schedule closes all dates, invalid schedule does not silently remove blackout constraints', () => {
  assert.deepEqual(eligibleTourDates(parseTourSchedule({...fields,enabled:'false'})),[]);
  for (const overrides of [{blackout_dates:'2026-02-30'},{minimum_days:'no'},{months_ahead:'0'},{seat_price:'0'},{operating_days:'["Someday"]'}]) assert.throws(()=>parseTourSchedule({...fields,...overrides}));
  assert.equal(managedTourDate('tour-seat-2026-11-14'),'2026-11-14');
  assert.equal(managedTourDate('tour-seat-2026-02-30'),null);
  assert.equal(managedTourDate('other-product'),null);
});
