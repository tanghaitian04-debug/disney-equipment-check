import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PEOPLE, POSITIONS, dateLabel, buildText, doorLabel, slotAssignments } from '../src/schedule.mjs';

const EXAMPLE = {
  '马强': '激光X', '刘庭旭': '观察A', '钱佳恩': '观察B',
  '张云翔': '控台', '邵成海': '视频', '陈军': '激光3',
  '罗光荣': '自动化', '赵国华': '台仓1', '闫国豪': '台仓2',
  '张禹': '特效', '贺坤华': '激光2',
};

test('名单17人、岗位12个、无英文名', () => {
  assert.equal(PEOPLE.length, 17);
  assert.equal(POSITIONS.length, 12);
  assert.ok(PEOPLE.every(n => !/[A-Za-z]/.test(n)));
});

test('日期按上海时间生成且星期正确', () => {
  assert.deepEqual(dateLabel(new Date('2026-11-05T10:00:00+08:00')), { key: '2026-11-05', label: '2026年11月5日 星期四' });
  assert.equal(dateLabel(new Date('2026-11-13T10:00:00+08:00')).label, '2026年11月13日 星期五');
});

test('无大门板勾选时与原模板一致（人名落位、无标注）', () => {
  const text = buildText('2026年11月5日 星期四', EXAMPLE);
  for (const line of ['【激光操作员】: 马强', '【控台操作员】: 张云翔', '【视频操作员】: 邵成海', '  【台仓1】: 赵国华', ' 【台仓2】: 闫国豪', '【激光观察员】：贺坤华（带大钥匙柜102号万能钥匙', '皇家宴会厅窗帘预设完成', '升降center piece'])
    assert.ok(text.includes(line), `missing: ${line}`);
  assert.ok(!text.includes('大门板'));
});

test('大门板标注：装、收、装收分别追加在人名后', () => {
  assert.equal(doorLabel('张云翔', { '张云翔': { z: true } }), '（装大门板）');
  assert.equal(doorLabel('张云翔', { '张云翔': { s: true } }), '（收大门板）');
  assert.equal(doorLabel('张云翔', { '张云翔': { z: true, s: true } }), '（装收大门板）');
  assert.equal(doorLabel('张云翔', {}), '');
  const text = buildText('2026年11月5日 星期四', EXAMPLE, { '张云翔': { z: true }, '邵成海': { z: true, s: true }, '陈军': { s: true } });
  assert.ok(text.includes('【控台操作员】: 张云翔（装大门板）'));
  assert.ok(text.includes('【视频操作员】: 邵成海（装收大门板）'));
  assert.ok(text.includes('【激光3】: 陈军（收大门板）'));
  assert.ok(text.includes('【激光操作员】: 马强\n'));
});

test('激光2与激光观察员同落一岗；空岗留空', () => {
  const by = slotAssignments({ '陈军': '激光2', '贺坤华': '激光观察员' });
  assert.equal(by['激光观察员'].length, 2);
  const text = buildText('2026年11月13日 星期五', { '陈军': '激光3' });
  assert.ok(text.includes('【激光操作员】: \n'));
});
