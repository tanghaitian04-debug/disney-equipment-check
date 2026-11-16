import test from 'node:test';
import assert from 'node:assert/strict';
import { rideZh, fmtNum, pctChange, fmtPct, axisSlots, alignSeries, niceCeil, nextSlotLabel, slotAgeMin } from '../src/crowdlogic.mjs';

test('rideZh maps known rides and falls back to the original name', () => {
  assert.equal(rideZh('Roaring Rapids'), '雷鸣山漂流');
  assert.equal(rideZh('Zootopia: Hot Pursuit'), '疯狂动物城：热力追踪');
  assert.equal(rideZh('Some Future Ride'), 'Some Future Ride');
  assert.equal(rideZh(''), '');
});

test('fmtNum adds thousand separators and dashes missing values', () => {
  assert.equal(fmtNum(53800), '53,800');
  assert.equal(fmtNum(0), '0');
  assert.equal(fmtNum(null), '–');
  assert.equal(fmtNum(NaN), '–');
});

test('pctChange computes one-decimal-ready rates and refuses bad bases', () => {
  assert.ok(Math.abs(pctChange(53800, 52400) - 2.6717) < 0.001);
  assert.ok(pctChange(40000, 50000) === -20);
  assert.equal(pctChange(100, 0), null);
  assert.equal(pctChange(100, null), null);
  assert.equal(pctChange(null, 100), null);
});

test('fmtPct shows arrows, one decimal, and a dash when not computable', () => {
  assert.equal(fmtPct(2.6717), '↑2.7%');
  assert.equal(fmtPct(-20), '↓20.0%');
  assert.equal(fmtPct(0), '↑0.0%');
  assert.equal(fmtPct(null), '–');
  assert.equal(fmtPct(Infinity), '–');
});

test('axisSlots covers 08:00..21:00 in 30-minute steps', () => {
  const s = axisSlots();
  assert.equal(s.length, 27);
  assert.equal(s[0], '08:00');
  assert.equal(s[1], '08:30');
  assert.equal(s[26], '21:00');
});

test('alignSeries indexes points by time and ignores junk', () => {
  const m = alignSeries([{ time: '09:00', heat: 100 }, { time: '09:30', heat: 200 }, { time: '10:00' }, null]);
  assert.equal(m.get('09:00'), 100);
  assert.equal(m.get('09:30'), 200);
  assert.equal(m.has('10:00'), false);
});

test('niceCeil rounds chart maxima up to clean values', () => {
  assert.equal(niceCeil(53800), 60000);
  assert.equal(niceCeil(60000), 60000);
  assert.equal(niceCeil(9999), 10000);
  assert.equal(niceCeil(0), 10000);
  assert.equal(niceCeil(-5), 10000);
});

test('nextSlotLabel gives the next :00/:30 Shanghai slot', () => {
  assert.equal(nextSlotLabel(Date.parse('2026-11-16T14:20:00+08:00')), '14:30');
  assert.equal(nextSlotLabel(Date.parse('2026-11-16T14:30:00+08:00')), '15:00');
  assert.equal(nextSlotLabel(Date.parse('2026-11-16T23:45:00+08:00')), '00:00');
  assert.equal(nextSlotLabel(Date.parse('2026-11-16T00:05:00+08:00')), '00:30');
});

test('slotAgeMin measures minutes since the slot start', () => {
  const slot = Date.parse('2026-11-16T14:00:00+08:00');
  assert.equal(slotAgeMin(slot, slot + 30 * 60000), 30);
  assert.equal(slotAgeMin(null, slot), null);
});
