import test from 'node:test';
import assert from 'node:assert/strict';
import { positionsForDay } from '../src/rosterutil.mjs';

const roster = {
  week: ['2026-11-15', '2026-11-16'],
  people: {
    '唐海添': [{ date: '2026-11-16', shift: '14:00-22:45', pos: '控台' }, { date: '2026-11-15', shift: '14:00-22:45', pos: '激光2' }],
    '郑思瑜': [{ date: '2026-11-16', shift: '14:00-22:45', pos: 'X激光' }],
    '贺坤华': [{ date: '2026-11-16', shift: '14:00-22:45', pos: '机动' }],
    '陈军': [{ date: '2026-11-16', shift: '14:00-22:45', pos: '激光2' }],
    '刘伟伟': [{ date: '2026-11-16', shift: '14:00-22:45', pos: '激光2' }],
    '闫国豪': [{ date: '2026-11-16', shift: 'OFF', pos: 'OFF' }],
    '罗光荣': [{ date: '2026-11-16', shift: '14:00-01:45', pos: '空着' }],
  },
};

test('positionsForDay groups by position in display order and joins shared positions', () => {
  const out = positionsForDay('2026-11-16', roster);
  assert.deepEqual(out.map(x => x.pos), ['控台', 'X激光', '激光2', '机动']);
  assert.deepEqual(out[0].names, ['唐海添']);
  assert.deepEqual(out[2].names, ['陈军', '刘伟伟']);
});

test('positionsForDay excludes OFF and untaught （空着） entries', () => {
  const out = positionsForDay('2026-11-16', roster);
  const names = out.flatMap(x => x.names);
  assert.ok(!names.includes('闫国豪'));
  assert.ok(!names.includes('罗光荣'));
});

test('positionsForDay returns an empty list for a day outside the roster week', () => {
  assert.deepEqual(positionsForDay('2026-12-25', roster), []);
});
