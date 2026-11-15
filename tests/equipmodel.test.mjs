import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICES } from '../src/devices.mjs';
import { legacyUid, migrateV1, reportText, reportSegments, emptyStore } from '../src/equipmodel.mjs';

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

test('report text follows the spec format with continuous numbering', () => {
  const store = emptyStore();
  const roof = DEVICES.find(d => d.name === 'Roof 1（219A） 7001');
  const tower = DEVICES.find(d => d.name === '塔1 7102');
  const fx = DEVICES.find(d => d.cat === '特效');
  store.days['2026-11-16'] = {
    [roof.uid]: { name: roof.name, path: 'x', reason: '不亮', time: '2026-11-16T06:35:00.000Z' },
    [tower.uid]: { name: tower.name, path: 'x', reason: '不受控', time: '2026-11-16T06:37:00.000Z' },
    [fx.uid]: { name: fx.name, path: 'x', reason: '无法正常启动', time: '2026-11-16T06:40:00.000Z' },
  };
  const txt = reportText('2026-11-16', store);
  assert.ok(txt.startsWith('设备故障检查报告\n\n检查日期：2026-11-16\n\n故障设备总数：3'));
  assert.ok(txt.includes('【灯光】'));
  assert.ok(txt.includes('2. 花园屋顶-580 Beam / Roof 1（219A） / 7001\n    故障原因：不亮'));
  assert.ok(txt.includes('1. 花园塔-Ckc Vh5 / 塔1 / 7102\n    故障原因：不受控'));
  assert.ok(txt.includes('【特效】'));
  assert.ok(txt.includes(`3. ${reportSegments(fx).join(' / ')}\n    故障原因：无法正常启动`));
  assert.ok(txt.endsWith('——本次检查结束——'));
  const empty = reportText('2026-11-16', emptyStore());
  assert.ok(empty.includes('故障设备总数：0'));
  assert.ok(empty.includes('暂无故障'));
});
