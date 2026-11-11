import test from 'node:test';
import assert from 'node:assert/strict';
import { activeAnnouncement, selectAnnouncement } from '../src/lib/announcement.ts';

const fields = {
  enabled: 'true', message: 'Seasonal offer',
  start_date: '2026-11-01', end_date: '2026-11-01',
};
const at = (timestamp, overrides = {}) => activeAnnouncement({ ...fields, ...overrides }, new Date(timestamp));

test('single-day banner spans the entire Eastern date across the fall DST change', () => {
  assert.equal(at('2026-11-01T03:59:59Z'), null);
  assert.ok(at('2026-11-01T04:00:00Z'));
  assert.ok(at('2026-11-02T04:59:59Z'));
  assert.equal(at('2026-11-02T05:00:00Z'), null);
});

const entry = (handle, overrides = {}, updatedAt = '2026-11-11T12:00:00Z') => ({
  handle, updatedAt,
  fields: { enabled: 'true', message: handle, start_date: '', end_date: '', ...overrides },
});
const today = new Date('2026-11-11T19:00:00Z');

test('selects the new scheduled entry when the original default has expired', () => {
  const entries = [
    entry('default', { end_date: '2026-11-10' }),
    entry('test-banner', { start_date: '2026-11-11', end_date: '2026-11-12' }),
  ];
  assert.equal(selectAnnouncement(entries, today).html, '<p>test-banner</p>');
  assert.equal(selectAnnouncement(entries, new Date('2026-11-13T05:00:00Z')), null);
});

test('latest eligible start date wins over overlapping or undated entries', () => {
  const entries = [
    entry('undated'), entry('earlier', { start_date: '2026-11-01' }),
    entry('latest', { start_date: '2026-11-11' }),
    entry('future', { start_date: '2026-11-12' }),
    entry('disabled', { start_date: '2026-11-11', enabled: 'false' }),
    entry('invalid', { start_date: '2026-11-11', end_date: '2026-11-10' }),
  ];
  assert.equal(selectAnnouncement(entries, today).html, '<p>latest</p>');
  assert.equal(selectAnnouncement([...entries].reverse(), today).html, '<p>latest</p>');
  assert.equal(selectAnnouncement(entries, new Date('2026-10-01T12:00:00Z')).html, '<p>undated</p>');
});

test('equal start dates prefer most recently edited, with stable ties independent of API order', () => {
  const older = entry('older', {}, '2026-11-10T12:00:00Z');
  const newer = entry('newer');
  assert.equal(selectAnnouncement([older, newer], today).html, '<p>newer</p>');
  const tied = entry('a-tied');
  assert.equal(selectAnnouncement([newer, tied], today).html, '<p>a-tied</p>');
  assert.equal(selectAnnouncement([tied, newer], today).html, '<p>a-tied</p>');
  assert.equal(selectAnnouncement([], today), null);
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

test('rich content takes precedence over the administrative name, and invalid or blank rich content hides', () => {
  const content = JSON.stringify({type: 'root', children: [{type: 'paragraph', children: [{type: 'text', value: 'Hello', bold: true}]}]});
  assert.equal(at('2026-11-01T12:00:00Z', {content}).html, '<p><strong>Hello</strong></p>');
  for (const content of ['not json', '{"type":"root","children":[]}', '{"type":"root","children":[{"type":"paragraph","children":[{"type":"text","value":" "}]}]}']) {
    assert.equal(at('2026-11-01T12:00:00Z', {content}), null);
  }
  assert.equal(at('2026-11-01T12:00:00Z', {message: '<script>bad</script>'}).html, '<p>&lt;script&gt;bad&lt;/script&gt;</p>');
});
