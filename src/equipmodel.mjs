// Pure logic for the V2 equipment fault recorder (456-device catalog).
// Storage: localStorage key equipment-check-v2 = { version:2, days:{ 'YYYY-MM-DD': { uid: {name,path,reason,time} } } }
// The legacy key equipment-check-v1 is NEVER modified; its records are migrated once.
import { DEVICES, CATS } from './devices.mjs';

export const KEY2 = 'equipment-check-v2';
export const KEY1 = 'equipment-check-v1';
export const QUICK_REASONS = ['不亮', '不受控', '闪烁', '颜色异常', '运动异常', '通信异常'];

const byUid = new Map(DEVICES.map(d => [d.uid, d]));
export const deviceByUid = uid => byUid.get(uid);
export const pathOf = d => [d.cat, d.group, d.sub].filter(Boolean).join(' / ');
export const fullPathOf = d => `${pathOf(d)} / ${d.name}`;

export function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function shiftDay(key, delta) {
  const d = new Date(`${key}T12:00:00+08:00`);
  d.setTime(d.getTime() + delta * 86400000);
  return dayKey(d);
}
export function fmtTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return parts.replace(' ', ' ');
}
export function fmtClock(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

export function emptyStore() { return { version: 2, days: {} }; }

export function loadStore(storage) {
  try {
    const raw = storage.getItem(KEY2);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object' || typeof s.days !== 'object' || !s.days) return null;
    return { version: 2, days: s.days };
  } catch { return null; }
}
export function saveStore(storage, store) {
  try { storage.setItem(KEY2, JSON.stringify(store)); } catch {}
}

// Map one legacy (V1) record to a V2 device uid. Returns null when unmappable.
// Garden codes 7t01-7t08 exist only in 花园塔-Ckc Vh5; outer codes 7001-7027 only in 花园屋顶-580 Beam.
export function legacyUid(r, devices = DEVICES) {
  if (!r || typeof r.code !== 'string') return null;
  const group = r.region === '外围灯' ? '花园屋顶-580 Beam' : (r.region === '花园' ? '花园塔-Ckc Vh5' : null);
  if (!group) return null;
  const hit = devices.find(d => d.group === group && d.name.endsWith(` ${r.code}`));
  return hit ? hit.uid : null;
}

export function migrateV1(storage, devices = DEVICES) {
  const store = emptyStore();
  let count = 0, skipped = 0;
  let rows = [];
  try { rows = JSON.parse(storage.getItem(KEY1) || '[]'); } catch { rows = []; }
  if (!Array.isArray(rows)) rows = [];
  for (const r of rows) {
    const uid = legacyUid(r, devices);
    if (!uid || !/^\d{4}-\d{2}-\d{2}$/.test(r.day || '')) { skipped++; continue; }
    const d = devices.find(x => x.uid === uid);
    const rec = {
      name: d.name,
      path: pathOf(d),
      reason: r.region === '外围灯' ? '旧版记录（未填写原因）' : (r.fault || '不亮'),
      time: r.time || new Date().toISOString(),
    };
    const dayMap = store.days[r.day] || (store.days[r.day] = {});
    const prev = dayMap[uid];
    if (!prev || Date.parse(rec.time) >= Date.parse(prev.time)) { if (!prev) count++; dayMap[uid] = rec; }
  }
  return { store, count, skipped };
}

export function dayRecords(store, day) { return (store && store.days[day]) || {}; }

export function countsForDay(store, day) {
  const recs = dayRecords(store, day);
  const per = {}; for (const c of CATS) per[c] = 0;
  let total = 0;
  for (const uid of Object.keys(recs)) {
    const d = deviceByUid(uid);
    if (d) { per[d.cat]++; total++; }
  }
  return { per, total };
}

// Report line segments: [group, sub?, device-short-name]; the sub prefix is
// stripped from the device name so "塔1 / 塔1 7101" reads "塔1 / 7101" as in the spec example.
export function reportSegments(d) {
  const segs = [d.group];
  if (d.sub) {
    segs.push(d.sub);
    segs.push(d.name.startsWith(`${d.sub} `) ? d.name.slice(d.sub.length + 1) : d.name);
  } else segs.push(d.name);
  return segs;
}

export function reportText(day, store) {
  const recs = dayRecords(store, day);
  const total = Object.keys(recs).length;
  const lines = ['设备故障检查报告', '', `检查日期：${day}`, '', `故障设备总数：${total}`, ''];
  if (!total) { lines.push('暂无故障', '', '——本次检查结束——'); return lines.join('\n'); }
  let n = 0;
  for (const cat of CATS) {
    const items = DEVICES.filter(d => d.cat === cat && recs[d.uid]);
    if (!items.length) continue;
    lines.push(`【${cat}】`, '');
    for (const d of items) {
      n++;
      lines.push(`${n}. ${reportSegments(d).join(' / ')}`);
      lines.push(`    故障原因：${recs[d.uid].reason}`);
    }
    lines.push('');
  }
  lines.push('——本次检查结束——');
  return lines.join('\n');
}

export function csvAll(store) {
  const esc = s => '"' + String(s ?? '').replaceAll('"', '""') + '"';
  const out = ['\ufeff日期,一级分类,二级分组,位置,设备,故障原因,记录时间'];
  const days = Object.keys(store.days).sort();
  for (const day of days) {
    const recs = store.days[day];
    const rows = Object.keys(recs).map(uid => ({ d: deviceByUid(uid), r: recs[uid] })).filter(x => x.d)
      .sort((a, b) => Date.parse(a.r.time) - Date.parse(b.r.time));
    for (const { d, r } of rows) out.push([day, d.cat, d.group, d.sub, d.name, r.reason, fmtTime(r.time)].map(esc).join(','));
  }
  return out.join('\r\n');
}
