import test from 'node:test';
import assert from 'node:assert/strict';
import { activeAnnouncement } from '../src/lib/announcement.ts';

const fields = {
  enabled: 'true', message: 'Seasonal offer', link_label: 'Order now', link_url: '/charcuterie',
  start_date: '2026-11-01', end_date: '2026-11-01',
};
const at = (timestamp, overrides = {}) => activeAnnouncement({ ...fields, ...overrides }, new Date(timestamp));

test('single-day banner spans the entire Eastern date across the fall DST change', () => {
  assert.equal(at('2026-11-01T03:59:59Z'), null);
  assert.ok(at('2026-11-01T04:00:00Z'));
  assert.ok(at('2026-11-02T04:59:59Z'));
  assert.equal(at('2026-11-02T05:00:00Z'), null);
});

test('spring daylight saving transition uses local midnight for both boundaries', () => {
  const dates = { start_date: '2026-03-08', end_date: '2026-03-08' };
  assert.equal(at('2026-03-08T04:59:59Z', dates), null);
  assert.ok(at('2026-03-08T05:00:00Z', dates));
  assert.ok(at('2026-03-09T03:59:59Z', dates));
  assert.equal(at('2026-03-09T04:00:00Z', dates), null);
});

test('blank dates are optional bounds; disabled and empty banners stay hidden', () => {
  assert.ok(at('2026-01-01T12:00:00Z', { start_date: '' }));
  assert.ok(at('2027-01-01T12:00:00Z', { end_date: '' }));
  assert.ok(at('2026-01-01T12:00:00Z', { start_date: '', end_date: '' }));
  assert.equal(at('2026-11-01T12:00:00Z', { enabled: 'false' }), null);
  assert.equal(at('2026-11-01T12:00:00Z', { message: ' ' }), null);
  assert.equal(activeAnnouncement({}), null);
});

test('invalid dates and reversed ranges hide the banner', () => {
  for (const dates of [
    { start_date: '2026-11-02' }, { end_date: '2026-02-30' },
    { start_date: 'invalid' }, { end_date: '2026-13-01' },
  ]) assert.equal(at('2026-11-01T12:00:00Z', dates), null);
});

test('banner links allow internal paths or HTTPS and reject executable or ambiguous URLs', () => {
  for (const link_url of ['/charcuterie?offer=holiday#order', 'https://example.com/offer']) {
    assert.equal(at('2026-11-01T12:00:00Z', { link_url }).linkUrl, link_url);
  }
  for (const link_url of ['', 'javascript:alert(1)', '//example.com', '/\\example.com', '/\t/example.com', 'http://example.com']) {
    const banner = at('2026-11-01T12:00:00Z', { link_url });
    assert.equal(banner.linkUrl, '');
    assert.equal(banner.message, fields.message);
  }
});
