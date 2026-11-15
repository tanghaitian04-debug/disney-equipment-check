// Cloud sync layer (toolbox V1.6.0): per-person accounts + team fault records.
// Backend: CloudBase env saka-toolbox (saka-toolbox-d6gr4buzr77a7eb0d), one cloud
// function `api` reached over its HTTP access URL (the free package refuses custom
// web safety domains, so no JS SDK — plain fetch; the function enforces CORS for
// https://check.saka77.cn and authenticates every data action with our own tokens).
// The local equipment-check-v2 store stays the on-device cache; this module keeps it
// in sync: local commits are diffed into ops and pushed, pulls merge cloud state back.
// Pure helpers are unit-tested; the HTTP adapter at the bottom is the only impure part.
import { loadStore, saveStore, emptyStore } from './equipmodel.mjs';

export const API_URL = 'https://saka-toolbox-d6gr4buzr77a7eb0d-1356325308.ap-shanghai.app.tcloudbase.com/api';
export const ACCOUNTS = [
  ['zhengsiyu', '郑思瑜'], ['maqiang', '马强'], ['hekunhua', '贺坤华'],
  ['liutingxu', '刘庭旭'], ['shaochenghai', '邵成海'], ['qianjiaen', '钱佳恩'],
  ['yanguohao', '闫国豪'], ['chenjun', '陈军'], ['liuweiwei', '刘伟伟'],
  ['tanghaitian', '唐海添'], ['nieguobiao', '聂国标'], ['lidongxu', '李东绪'],
  ['zhaoguohua', '赵国华'], ['luoguangrong', '罗光荣'], ['zhangyu', '张禹'],
  ['chencai', '陈财'], ['zhangyunxiang', '张云翔'],
].map(([username, name]) => ({ username, name }));
export const MANAGER_ACCOUNTS = [
  ['amao', 'Amao'], ['claire', 'CLAIRE'], ['sharon', 'Sharon'], ['qiqi', '七七'],
].map(([username, name]) => ({ username, name, role: 'manager' }));
export const SESSION_KEY = 'toolbox-session-v1';
export const QUEUE_KEY = 'equipment-cloud-queue-v1';
export const META_KEY = 'equipment-cloud-meta-v1';

export class ApiError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// ---------- session ----------
export function loadSession(storage) {
  try {
    const s = JSON.parse(storage.getItem(SESSION_KEY) || 'null');
    if (!s || typeof s.token !== 'string' || typeof s.username !== 'string') return null;
    return { token: s.token, username: s.username, name: s.name || s.username, mustChange: !!s.mustChange, role: s.role || 'member', avatar: s.avatar || null, joinDate: s.joinDate || null };
  } catch { return null; }
}
export function saveSession(storage, s) {
  try { storage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
}
export function clearSession(storage) {
  try { storage.removeItem(SESSION_KEY); } catch {}
}

// ---------- record helpers ----------
export function recEqual(a, b) {
  return !!a && !!b && a.name === b.name && a.path === b.path && a.reason === b.reason
    && a.time === b.time && (a.reporter || '') === (b.reporter || '');
}
const stamp = r => Date.parse((r && (r.updatedAt || r.time)) || 0) || 0;

// Normalize one cloud day (array of records) into the local {uid: rec} map shape.
export function normalizeDay(arr) {
  const map = {};
  if (Array.isArray(arr)) for (const r of arr) {
    if (!r || !r.uid) continue;
    const rec = { name: r.name, path: r.path, reason: r.reason, time: r.time };
    if (r.reporter) rec.reporter = r.reporter;
    if (r.updatedAt) rec.updatedAt = r.updatedAt;
    map[r.uid] = rec;
  }
  return map;
}

// ---------- op diff / queue ----------
export function diffOps(prev, next) {
  const ops = [];
  const p = (prev && prev.days) || {}, n = (next && next.days) || {};
  for (const day of new Set([...Object.keys(p), ...Object.keys(n)])) {
    const a = p[day] || {}, b = n[day] || {};
    if (Object.keys(a).length && !Object.keys(b).length) { ops.push({ type: 'clearDay', day }); continue; }
    for (const uid of Object.keys(b)) if (!a[uid] || !recEqual(a[uid], b[uid])) ops.push({ type: 'upsert', day, uid, rec: b[uid] });
    for (const uid of Object.keys(a)) if (!b[uid]) ops.push({ type: 'remove', day, uid });
  }
  return ops;
}
const opKey = op => (op.type === 'clearDay' ? `clear|${op.day}` : `${op.day}|${op.uid}`);
export function enqueueOps(queue, ops) {
  let q = Array.isArray(queue) ? [...queue] : [];
  for (const op of ops) {
    if (op.type === 'clearDay') q = q.filter(o => o.day !== op.day);
    else q = q.filter(o => opKey(o) !== opKey(op));
    q.push(op);
  }
  return q;
}
export function applyOpsToMap(map, ops) {
  const out = { ...map };
  for (const op of ops) {
    if (op.type === 'clearDay') for (const k of Object.keys(out)) delete out[k];
    else if (op.type === 'upsert') out[op.uid] = op.rec;
    else if (op.type === 'remove') delete out[op.uid];
  }
  return out;
}
export function loadQueue(storage) {
  try { const q = JSON.parse(storage.getItem(QUEUE_KEY) || '[]'); return Array.isArray(q) ? q : []; } catch { return []; }
}
export function saveQueue(storage, q) {
  try { storage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
}
export function loadMeta(storage) {
  try { const m = JSON.parse(storage.getItem(META_KEY) || 'null'); return m && Array.isArray(m.boot) ? m : { boot: [] }; } catch { return { boot: [] }; }
}
export function saveMeta(storage, m) {
  try { storage.setItem(META_KEY, JSON.stringify(m)); } catch {}
}

// ---------- sync engine (api + storage injected) ----------
// Pull the given days from the cloud and merge into the local store.
// First pull per day = bootstrap union (local-only records are queued for upload,
// conflicts keep the newer record). Later pulls are authoritative (a colleague's
// deletion propagates), with still-pending local ops re-applied on top.
export async function pullAndMerge({ storage, api, days }) {
  const store = loadStore(storage) || emptyStore();
  const meta = loadMeta(storage);
  const queue = loadQueue(storage);
  const res = await api({ action: 'list', days });
  const cloudDays = (res && res.days) || {};
  const uploads = [];
  const nextDays = { ...store.days };
  for (const day of days) {
    const cloudMap = normalizeDay(cloudDays[day]);
    if (meta.boot.includes(day)) {
      nextDays[day] = applyOpsToMap(cloudMap, queue.filter(o => o.day === day));
    } else {
      const localMap = store.days[day] || {};
      const merged = { ...localMap };
      for (const [uid, crec] of Object.entries(cloudMap)) {
        if (!merged[uid] || stamp(crec) >= stamp(merged[uid])) merged[uid] = crec;
      }
      for (const [uid, lrec] of Object.entries(localMap)) {
        const crec = cloudMap[uid];
        if (!crec || (stamp(lrec) > stamp(crec) && !recEqual(lrec, crec))) uploads.push({ type: 'upsert', day, uid, rec: lrec });
      }
      nextDays[day] = merged;
      meta.boot.push(day);
    }
  }
  const next = { version: 2, days: nextDays };
  saveStore(storage, next);
  if (uploads.length) saveQueue(storage, enqueueOps(queue, uploads));
  saveMeta(storage, meta);
  return next;
}

function opPayload(op) {
  if (op.type === 'upsert') return { action: 'upsert', day: op.day, uid: op.uid, name: op.rec.name, path: op.rec.path, reason: op.rec.reason, time: op.rec.time };
  if (op.type === 'remove') return { action: 'remove', day: op.day, uid: op.uid };
  return { action: 'clearDay', day: op.day };
}
export async function flushQueue({ storage, api }) {
  let q = loadQueue(storage);
  while (q.length) {
    try { await api(opPayload(q[0])); }
    catch (e) { return { ok: false, error: (e && e.code) || String(e), remaining: q.length }; }
    q = q.slice(1);
    saveQueue(storage, q);
  }
  return { ok: true };
}
export async function pushOps({ storage, api, ops }) {
  if (ops && ops.length) saveQueue(storage, enqueueOps(loadQueue(storage), ops));
  return flushQueue({ storage, api });
}

// ---------- HTTP adapter (browser fetch) ----------
export async function callApi(data) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const r = await resp.json().catch(() => null);
      if (!r || typeof r.ok !== 'boolean') throw new ApiError('BAD_RESPONSE');
      if (!r.ok) throw new ApiError(r.error || 'API_FAIL');
      return r;
    } catch (e) {
      if (e instanceof ApiError && e.code !== 'BAD_RESPONSE') throw e;
      lastErr = e;
    }
  }
  throw lastErr || new ApiError('NETWORK');
}
// Authenticated api used by the sync engine: attaches the session token and
// drops the session when the backend says it is no longer valid.
export function authedApi(storage) {
  return async data => {
    const s = loadSession(storage);
    if (!s) throw new ApiError('NOT_LOGGED_IN');
    try { return await callApi({ ...data, token: s.token }); }
    catch (e) { if (e && e.code === 'NOT_LOGGED_IN') clearSession(storage); throw e; }
  };
}
export async function apiLogin(storage, username, password) {
  const r = await callApi({ action: 'login', username, password });
  const s = { token: r.token, username: r.username, name: r.name, mustChange: !!r.mustChange, role: r.role || 'member', avatar: r.avatar || null, joinDate: r.joinDate || null };
  saveSession(storage, s);
  return s;
}
export async function apiChangePassword(storage, oldPassword, newPassword) {
  await authedApi(storage)({ action: 'changePassword', oldPassword, newPassword });
  const s = loadSession(storage);
  if (s) saveSession(storage, { ...s, mustChange: false });
}
export function apiLogout(storage) { clearSession(storage); }
// The hire date lives on the account too, so the 加入迪士尼 day counter matches on every phone.
// Homepage content (shows + roster PDF), editable by manager accounts only.
export async function apiGetShows() {
  try { const r = await callApi({ action: 'getShows' }); return r && Array.isArray(r.shows) ? r.shows : null; }
  catch { return null; }
}
export async function apiSetShows(storage, entries) {
  return authedApi(storage)({ action: 'setShows', entries });
}
export async function apiGetRosterMeta() {
  try { const r = await callApi({ action: 'getRosterMeta' }); return r && r.ok ? r : null; }
  catch { return null; }
}
export async function apiGetRosterPdf() {
  // Chunked download: fetch the parts and join them (the gateway caps payloads).
  try {
    const meta = await apiGetRosterMeta();
    if (meta && meta.hasPdf && meta.total) {
      let out = '';
      for (let i = 0; i < meta.total; i++) {
        let chunk = null;
        for (let att = 0; att < 4 && chunk === null; att++) {
          try { const r = await callApi({ action: 'getRosterPdfPart', index: i }); if (r && typeof r.chunk === 'string') chunk = r.chunk; } catch {}
        }
        if (chunk === null) return null;
        out += chunk;
      }
      return out;
    }
    const r = await callApi({ action: 'getRosterPdf' });
    return r && r.ok ? (r.base64 || null) : null;
  } catch { return null; }
}
// Wind-page weather (QWeather via the cloud function; credentials stay server-side).
// Returns the raw {ok, rain, alerts} result, or null on network failure.
export async function apiGetWeather() {
  try { const r = await callApi({ action: 'getWeather' }); return r && r.ok ? r : null; }
  catch { return null; }
}
export async function apiSetRosterPdf(storage, base64, label) {
  // Chunked upload in <=45000-char parts (gateway rejects bodies over ~100KB);
  // each part is retried — the free gateway occasionally drops a request.
  const CHUNK = 45000;
  const total = Math.max(1, Math.ceil(base64.length / CHUNK));
  for (let part = 0; part < total; part++) {
    const payload = { action: 'setRosterPdf', part, total, chunk: base64.slice(part * CHUNK, (part + 1) * CHUNK) };
    if (part === 0) payload.label = label;
    let lastErr = null, done = false;
    for (let att = 0; att < 3 && !done; att++) {
      try { await authedApi(storage)(payload); done = true; }
      catch (e) { lastErr = e; }
    }
    if (!done) throw lastErr;
  }
  return { ok: true };
}
export async function apiSetJoinDate(storage, joinDate) {
  await authedApi(storage)({ action: 'setJoinDate', joinDate });
  const s = loadSession(storage);
  if (s) { const next = { ...s, joinDate: joinDate || null }; saveSession(storage, next); return next; }
  return null;
}
// Avatars live on the account (users collection) so they follow the login to any phone.
export async function apiSetAvatar(storage, avatar) {
  await authedApi(storage)({ action: 'setAvatar', avatar });
  const s = loadSession(storage);
  if (s) { const next = { ...s, avatar: avatar || null }; saveSession(storage, next); return next; }
  return null;
}
