import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRain, intensityBand, alertColor, dayLabel, dayText, aqiColor } from '../src/wxlogic.mjs';

const NOW = Date.parse('2026-11-16T07:00:00+08:00');
const pts = (arr, type = 'rain') => arr.map((p, i) => ({ t: new Date(NOW + i * 5 * 60000).toISOString(), p, type }));

test('no precip in 2h -> hasRain false', () => {
  const a = analyzeRain(pts([0, 0, 0, 0]), NOW);
  assert.equal(a.hasRain, false);
});

test('rain starting in 15 min, small band, ends in window', () => {
  const a = analyzeRain(pts([0, 0, 0, 0.2, 0.2, 0, 0]), NOW);
  assert.equal(a.hasRain, true);
  assert.equal(a.rainingNow, false);
  assert.equal(a.startInMin, 15);
  assert.equal(a.band, '小'); // 0.2mm/5min -> 2.4mm/h
  assert.equal(a.continuesBeyond, false);
  assert.equal(a.endTime, new Date(NOW + 5 * 5 * 60000).toISOString());
});

test('raining now and continuing beyond the window', () => {
  const a = analyzeRain(pts([0.5, 0.5, 0.5]), NOW);
  assert.equal(a.rainingNow, true);
  assert.equal(a.band, '中'); // 6mm/h
  assert.equal(a.continuesBeyond, true);
  assert.equal(a.endTime, null);
});

test('intensity bands on peak hourly rate', () => {
  assert.equal(intensityBand(0), '');
  assert.equal(intensityBand(2.4), '小');
  assert.equal(intensityBand(2.5), '中');
  assert.equal(intensityBand(8), '大');
  assert.equal(intensityBand(16), '暴');
  assert.equal(analyzeRain(pts([1.4]), NOW).band, '暴'); // 16.8mm/h
});

test('snow-only precip reports snow kind', () => {
  const a = analyzeRain(pts([0, 0.3], 'snow'), NOW);
  assert.equal(a.kind, '雪');
});

test('unusable points -> null', () => {
  assert.equal(analyzeRain(null, NOW), null);
  assert.equal(analyzeRain([], NOW), null);
});

test('alert color mapping and fallback', () => {
  assert.equal(alertColor('yellow').label, '黄色');
  assert.equal(alertColor('RED').hex, '#ff5a52');
  assert.equal(alertColor('').label, '');
  assert.equal(alertColor(undefined).hex, '#9aa4b8');
});

test('dayLabel: today / tomorrow / weekday (local-time safe)', () => {
  const now = new Date(2026, 10, 16, 13).getTime(); // Mon 2026-11-16 local
  assert.deepEqual(dayLabel('2026-11-16', now), { md: '11月16日', rel: '今天', wd: '周一' });
  assert.equal(dayLabel('2026-11-17', now).rel, '明天');
  const d3 = dayLabel('2026-11-19', now);
  assert.equal(d3.rel, '');
  assert.equal(d3.wd, '周四');
  assert.deepEqual(dayLabel('bad', now), { md: '', rel: '', wd: '' });
  assert.deepEqual(dayLabel(null, now), { md: '', rel: '', wd: '' });
});

test('dayText joins day/night only when different', () => {
  assert.equal(dayText({ textDay: '晴', textNight: '多云' }), '晴转多云');
  assert.equal(dayText({ textDay: '晴', textNight: '晴' }), '晴');
  assert.equal(dayText({ textDay: '', textNight: '阴' }), '阴');
  assert.equal(dayText(null), '');
});

test('aqiColor prefers valid API hex, else CN level map', () => {
  assert.equal(aqiColor('1', '#00e400'), '#00e400');
  assert.equal(aqiColor('3', ''), '#ff7e00');
  assert.equal(aqiColor('2', 'red'), '#ffe93e');
  assert.equal(aqiColor('', null), '#9aa4b8');
});
