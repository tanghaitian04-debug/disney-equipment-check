import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICES } from '../src/devices.mjs';
import { legacyUid, migrateV1, reportText, reportSegments, emptyStore, inspectionDayKey, recoveredFor } from '../src/equipmodel.mjs';

const fakeStorage = obj => ({ getItem: k => (k in obj ? obj[k] : null), setItem: () => {} });

test('legacy garden and outer codes map to exactly one new device', () => {
  const g = DEVICES.find(d => d.name === '塔6 7608');
  const o = DEVICES.find(d => d.name === 'Roof 3（小镇） 7007');
  assert.equal(legacyUid({ region: '花园', code: '7608' }), g.uid);
  assert.equal(legacyUid({ region: '外围灯', code: '7007' }), o.uid);
  assert.equal(legacyUid({ region: '花园', code: '9999' }), null);
  assert.equal(legacyUid({ region: '城堡', code: '7608' }), null);
});

test('migration keeps reasons, collapses duplicates to the latest, never invents data', () => {
  const v1 = [
    { id: 'a', code: '7608', region: '花园', day: '2026-11-15', time: '2026-11-15T01:00:00.000Z', fault: '不亮' },
    { id: 'b', code: '7608', region: '花园', day: '2026-11-15', time: '2026-11-15T02:00:00.000Z', fault: '不受控' },
    { id: 'c', code: '7007', region: '外围灯', roof: 'Roof3', area: '小镇', day: '2026-11-15', time: '2026-11-15T03:00:00.000Z' },
  ];
  const { store, count, skipped } = migrateV1(fakeStorage({ 'equipment-check-v1': JSON.stringify(v1) }));
  assert.equal(count, 2); assert.equal(skipped, 0);
  const day = store.days['2026-11-15'];
  assert.equal(Object.keys(day).length, 2);
  const g = DEVICES.find(d => d.name === '塔6 7608');
  assert.equal(day[g.uid].reason, '不受控');
  const o = DEVICES.find(d => d.name === 'Roof 3（小镇） 7007');
  assert.match(day[o.uid].reason, /旧版记录/);
});

test('report segments strip the sub prefix like the spec example', () => {
  const roof = DEVICES.find(d => d.name === 'Roof 1（219A） 7001');
  assert.deepEqual(reportSegments(roof), ['花园屋顶-580 Beam', 'Roof 1（219A）', '7001']);
  const tower = DEVICES.find(d => d.name === '塔1 7102');
  assert.deepEqual(reportSegments(tower), ['花园塔-Ckc Vh5', '塔1', '7102']);
});

test('inspection day rolls over at 01:00 Asia/Shanghai, not midnight', () => {
  assert.equal(inspectionDayKey(new Date('2026-11-16T00:00:00+08:00')), '2026-11-15');
  assert.equal(inspectionDayKey(new Date('2026-11-16T00:59:59+08:00')), '2026-11-15');
  assert.equal(inspectionDayKey(new Date('2026-11-16T01:00:00+08:00')), '2026-11-16');
  assert.equal(inspectionDayKey(new Date('2026-11-16T23:59:00+08:00')), '2026-11-16');
  assert.equal(inspectionDayKey(new Date('2026-11-15T17:30:00+08:00')), '2026-11-15');
});

test('recovered = faulted yesterday, not faulted today; shown only on the first day after', () => {
  const store = emptyStore();
  const a = DEVICES.find(d => d.name === 'Roof 1（219A） 7001');
  const b = DEVICES.find(d => d.name === '塔1 7102');
  store.days['2026-11-14'] = {
    [a.uid]: { name: a.name, path: 'x', reason: '不亮', time: '2026-11-14T06:00:00.000Z' },
    [b.uid]: { name: b.name, path: 'x', reason: '闪烁', time: '2026-11-14T06:05:00.000Z' },
  };
  store.days['2026-11-15'] = {
    [b.uid]: { name: b.name, path: 'x', reason: '不受控', time: '2026-11-15T06:00:00.000Z' },
  };
  const rec15 = recoveredFor(store, '2026-11-15');
  assert.equal(rec15.length, 1);
  assert.equal(rec15[0].d.uid, a.uid);
  assert.equal(rec15[0].prevReason, '不亮');
  // 11-16: a was already recovered on 11-15, so it must not repeat; b ended on 11-15 -> recovered on 11-16
  const rec16 = recoveredFor(store, '2026-11-16');
  assert.equal(rec16.length, 1);
  assert.equal(rec16[0].d.uid, b.uid);
  assert.equal(rec16[0].prevReason, '不受控');
});

test('report text follows the V2.1 format with faults and recovered sections', () => {
  const store = emptyStore();
  const roof = DEVICES.find(d => d.name === 'Roof 2（小飞象/提摩太小吃） 7010');
  const old = DEVICES.find(d => d.name === 'Roof 1（219A） 7001');
  store.days['2026-11-14'] = {
    [old.uid]: { name: old.name, path: 'x', reason: '不亮', time: '2026-11-14T06:35:00.000Z' },
  };
  store.days['2026-11-15'] = {
    [roof.uid]: { name: roof.name, path: 'x', reason: '不受控', time: '2026-11-15T06:37:00.000Z' },
  };
  const txt = reportText('2026-11-15', store);
  assert.ok(txt.startsWith('设备检查结果\n\n检查日期：2026年11月15日\n\n当前故障：1台\n\n已恢复：1台'));
  assert.ok(txt.includes('【当前故障】\n\n灯光 / 花园屋顶-580 Beam / Roof 2（小飞象/提摩太小吃） / 7010\n\n故障原因：不受控'));
  assert.ok(txt.includes('【已恢复】\n\n灯光 / 花园屋顶-580 Beam / Roof 1（219A） / 7001\n\n状态：已恢复\n\n上一检查日故障：不亮'));
  assert.ok(txt.endsWith('——检查结束——'));
  const empty = reportText('2026-11-15', emptyStore());
  assert.ok(empty.includes('当前故障：0台'));
  assert.ok(empty.includes('已恢复：0台'));
});

test('planCopyYesterday copies all of yesterday, skips devices already recorded today', async () => {
  const { planCopyYesterday, emptyStore } = await import('../src/equipmodel.mjs');
  const store = emptyStore();
  store.days['2026-11-15'] = {
    s1: { name: 'A', path: 'p', reason: '不亮', time: '2026-11-15T06:00:00.000Z' },
    s2: { name: 'B', path: 'p', reason: '闪烁', time: '2026-11-15T06:01:00.000Z' },
    s3: { name: 'C', path: 'p', reason: '不受控', time: '2026-11-15T06:02:00.000Z' },
  };
  store.days['2026-11-16'] = {
    s2: { name: 'B', path: 'p', reason: '颜色异常', time: '2026-11-16T06:00:00.000Z' },
  };
  const plan = planCopyYesterday(store, '2026-11-16', '2026-11-16T06:05:00.000Z');
  assert.equal(plan.yesterdayKey, '2026-11-15');
  assert.equal(plan.yesterdayCount, 3);
  assert.equal(plan.count, 2);
  assert.equal(plan.skipped, 1);
  assert.deepEqual(Object.keys(plan.add).sort(), ['s1', 's3']);
  assert.equal(plan.add.s1.reason, '不亮');
  assert.equal(plan.add.s1.time, '2026-11-16T06:05:00.000Z');
  // today's own record for s2 keeps its own (edited) reason, untouched
  assert.equal(plan.add.s2, undefined);
});

test('planCopyYesterday with no yesterday records plans nothing', async () => {
  const { planCopyYesterday, emptyStore } = await import('../src/equipmodel.mjs');
  const plan = planCopyYesterday(emptyStore(), '2026-11-16', '2026-11-16T06:05:00.000Z');
  assert.equal(plan.yesterdayCount, 0);
  assert.equal(plan.count, 0);
});
