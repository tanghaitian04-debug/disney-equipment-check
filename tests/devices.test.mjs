import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICES, CATS } from '../src/devices.mjs';

test('catalog has exactly 456 devices in the 6 source categories', () => {
  assert.equal(DEVICES.length, 456);
  assert.deepEqual(CATS, ['Show Lighting', '灯光', '水景', '特效', '视频', '机械']);
  const per = {};
  for (const d of DEVICES) per[d.cat] = (per[d.cat] || 0) + 1;
  assert.deepEqual(per, { 'Show Lighting': 35, '灯光': 200, '水景': 49, '特效': 85, '视频': 69, '机械': 18 });
});

test('uids and full paths are unique; names are never empty', () => {
  assert.equal(new Set(DEVICES.map(d => d.uid)).size, 456);
  assert.equal(new Set(DEVICES.map(d => `${d.cat}/${d.group}/${d.sub}/${d.name}`)).size, 456);
  for (const d of DEVICES) { assert.ok(d.name.length > 0); assert.ok(d.group.length > 0); }
});

test('roof subgroups use the full required location names', () => {
  const subs = [...new Set(DEVICES.filter(d => d.group === '花园屋顶-580 Beam').map(d => d.sub))].sort();
  assert.deepEqual(subs, ['Roof 1（219A）', 'Roof 2（小飞象/提摩太小吃）', 'Roof 3（小镇）', 'Roof 4（33俱乐部屋顶）', 'Roof 5（医务室）', 'Roof 6（十二朋友园）', 'Roof 7（219B）'].sort());
  assert.equal(DEVICES.filter(d => d.group === '花园屋顶-580 Beam').length, 27);
});

test('garden tower groups: 72 each, towers 1-9 with 8 lamps', () => {
  for (const g of ['花园塔-Ckc Vh5', '花园塔-Sgm P6']) {
    const rows = DEVICES.filter(d => d.group === g);
    assert.equal(rows.length, 72);
    assert.deepEqual([...new Set(rows.map(d => d.sub))], ['塔1', '塔2', '塔3', '塔4', '塔5', '塔6', '塔7', '塔8', '塔9']);
    for (const t of ['塔1', '塔5', '塔9']) assert.equal(rows.filter(d => d.sub === t).length, 8);
  }
});
