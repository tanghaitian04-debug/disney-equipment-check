import test from 'node:test';
import assert from 'node:assert/strict';
import { diffOps, enqueueOps, applyOpsToMap, normalizeDay, pullAndMerge, flushQueue, pushOps, loadQueue, loadSession, saveSession, clearSession, apiLogin } from '../src/cloud.mjs';
import { KEY2 } from '../src/equipmodel.mjs';

const fakeStorage = () => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
};
const rec = (reason, time, extra = {}) => ({ name: '塔1 7101', path: '灯光 / 花园塔-Ckc Vh5 / 塔1', reason, time, ...extra });
const T1 = '2026-11-16T02:00:00.000Z', T2 = '2026-11-16T03:00:00.000Z';

// In-memory stand-in for the cloud function, mirroring its contract.
function fakeServer() {
  const days = {}; // day -> Map uid -> rec(+updatedAt)
  let clock = Date.parse('2026-11-16T04:00:00.000Z');
  const api = async data => {
    if (data.action === 'list') {
      const out = {};
      for (const d of data.days) out[d] = [...(days[d] || new Map()).entries()].map(([uid, r]) => ({ uid, ...r }));
      return { ok: true, days: out };
    }
    if (data.action === 'upsert') {
      const m = days[data.day] || (days[data.day] = new Map());
      m.set(data.uid, { name: data.name, path: data.path, reason: data.reason, time: data.time, reporter: '唐海添', updatedAt: new Date(clock += 1000).toISOString() });
      return { ok: true };
    }
    if (data.action === 'remove') { days[data.day]?.delete(data.uid); return { ok: true }; }
    if (data.action === 'clearDay') { days[data.day] = new Map(); return { ok: true }; }
    throw new Error('bad action');
  };
  return { api, days };
}

test('diffOps detects add/change/remove and clearDay', () => {
  const prev = { version: 2, days: { '2026-11-16': { s1: rec('不亮', T1), s2: rec('闪烁', T1) }, '2026-11-15': { s9: rec('不亮', T1) } } };
  const next = { version: 2, days: { '2026-11-16': { s1: rec('不受控', T1), s3: rec('不亮', T2) }, '2026-11-15': {} } };
  const ops = diffOps(prev, next);
  assert.deepEqual(ops.filter(o => o.type === 'clearDay'), [{ type: 'clearDay', day: '2026-11-15' }]);
  assert.deepEqual(ops.filter(o => o.type === 'upsert').map(o => o.uid).sort(), ['s1', 's3']);
  assert.deepEqual(ops.filter(o => o.type === 'remove'), [{ type: 'remove', day: '2026-11-16', uid: 's2' }]);
  assert.deepEqual(diffOps(prev, prev), []);
});

test('enqueueOps dedupes per device and clearDay wipes pending day ops', () => {
  let q = enqueueOps([], [{ type: 'upsert', day: 'D', uid: 's1', rec: rec('不亮', T1) }]);
  q = enqueueOps(q, [{ type: 'remove', day: 'D', uid: 's1' }]);
  assert.deepEqual(q, [{ type: 'remove', day: 'D', uid: 's1' }]);
  q = enqueueOps(q, [{ type: 'upsert', day: 'D', uid: 's2', rec: rec('闪烁', T1) }, { type: 'clearDay', day: 'D' }]);
  assert.deepEqual(q, [{ type: 'clearDay', day: 'D' }]);
});

test('applyOpsToMap replays pending ops onto a pulled day', () => {
  const base = { s1: rec('不亮', T1), s2: rec('闪烁', T1) };
  const out = applyOpsToMap(base, [
    { type: 'remove', day: 'D', uid: 's1' },
    { type: 'upsert', day: 'D', uid: 's3', rec: rec('不受控', T2) },
  ]);
  assert.deepEqual(Object.keys(out).sort(), ['s2', 's3']);
});

test('normalizeDay maps the cloud array into the local shape', () => {
  const m = normalizeDay([{ uid: 's1', ...rec('不亮', T1), reporter: '马强', updatedAt: T2 }, { bad: true }]);
  assert.deepEqual(Object.keys(m), ['s1']);
  assert.equal(m.s1.reporter, '马强');
  assert.equal(m.s1.updatedAt, T2);
});

test('bootstrap pull unions local and cloud, queues local-only uploads', async () => {
  const storage = fakeStorage();
  const { api, days } = fakeServer();
  days['2026-11-16'] = new Map([['s2', { ...rec('闪烁', T2), reporter: '马强', updatedAt: T2 }]]);
  storage.setItem(KEY2, JSON.stringify({ version: 2, days: { '2026-11-16': { s1: rec('不亮', T1), s2: rec('不亮', T1) } } }));
  const store = await pullAndMerge({ storage, api, days: ['2026-11-16'] });
  // cloud s2 is newer and wins; local s1 survives and is queued for upload
  assert.equal(store.days['2026-11-16'].s2.reason, '闪烁');
  assert.equal(store.days['2026-11-16'].s1.reason, '不亮');
  const q = loadQueue(storage);
  assert.deepEqual(q.map(o => `${o.type}:${o.uid}`), ['upsert:s1']);
  // flush uploads s1 to the server
  const r = await flushQueue({ storage, api });
  assert.equal(r.ok, true);
  assert.equal(days['2026-11-16'].get('s1').reason, '不亮');
  assert.equal(loadQueue(storage).length, 0);
});

test('authoritative pull propagates a colleague deletion', async () => {
  const storage = fakeStorage();
  const { api, days } = fakeServer();
  days['2026-11-16'] = new Map([['s1', { ...rec('不亮', T1), reporter: '马强', updatedAt: T1 }]]);
  await pullAndMerge({ storage, api, days: ['2026-11-16'] }); // bootstrap
  days['2026-11-16'].delete('s1'); // colleague unchecks it
  const store = await pullAndMerge({ storage, api, days: ['2026-11-16'] });
  assert.deepEqual(store.days['2026-11-16'], {});
});

test('flushQueue stops at the first failure and keeps the rest', async () => {
  const storage = fakeStorage();
  let calls = 0;
  const api = async () => { calls++; if (calls === 2) throw Object.assign(new Error('OFFLINE'), { code: 'OFFLINE' }); return { ok: true }; };
  const r0 = await pushOps({ storage, api, ops: [
    { type: 'remove', day: 'D', uid: 's1' },
    { type: 'remove', day: 'D', uid: 's2' },
    { type: 'remove', day: 'D', uid: 's3' },
  ] });
  assert.equal(r0.ok, false);
  assert.equal(loadQueue(storage).length, 2);
});

test('session helpers round-trip and reject junk', () => {
  const storage = fakeStorage();
  assert.equal(loadSession(storage), null);
  saveSession(storage, { token: 't', username: 'tanghaitian', name: '唐海添', mustChange: true });
  assert.deepEqual(loadSession(storage), { token: 't', username: 'tanghaitian', name: '唐海添', mustChange: true, role: 'member', avatar: null, joinDate: null });
  saveSession(storage, { token: 't', username: 'tanghaitian', name: '唐海添', mustChange: false, avatar: 'data:image/jpeg;base64,x' });
  assert.equal(loadSession(storage).avatar, 'data:image/jpeg;base64,x');
  storage.setItem('toolbox-session-v1', '{"nope":1}');
  assert.equal(loadSession(storage), null);
  clearSession(storage);
  assert.equal(loadSession(storage), null);
});

test('apiLogin persists the role from the login response', async () => {
  const st = fakeStorage();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, token: 'tok1', username: 'qiqi', name: '七七', mustChange: true, role: 'manager', avatar: null, joinDate: null }) });
  try {
    const s = await apiLogin(st, 'qiqi', '000000');
    assert.equal(s.role, 'manager');
    assert.equal(loadSession(st).role, 'manager');
  } finally { globalThis.fetch = realFetch; }
});
