import React, { useState, useEffect, useMemo, useRef } from 'react';
// @ts-ignore plain ESM data with unit tests
import { DEVICES, CATS } from './devices.mjs';
// @ts-ignore plain ESM logic with unit tests
import { QUICK_REASONS, deviceByUid, pathOf, inspectionDayKey, dateCN, initStore, saveStore, dayRecords, countsForDay, shiftDay, planCopyYesterday } from './equipmodel.mjs';
// @ts-ignore plain ESM logic with unit tests
import { authedApi, diffOps, pushOps, pullAndMerge, flushQueue, loadQueue } from './cloud.mjs';

type Rec = { name: string; path: string; reason: string; time: string; reporter?: string; updatedAt?: string };
type Session = { token: string; username: string; name: string; mustChange: boolean };
type Store = { version: number; days: Record<string, Record<string, Rec>> };
type Dev = { uid: string; cat: string; group: string; sub: string; name: string };

const allDevs = DEVICES as Dev[];
function groupsOf(cat: string) {
  const seen: string[] = [];
  for (const d of allDevs) if (d.cat === cat && !seen.includes(d.group)) seen.push(d.group);
  return seen;
}
function subsOf(cat: string, group: string) {
  const seen: string[] = [];
  for (const d of allDevs) if (d.cat === cat && d.group === group && d.sub && !seen.includes(d.sub)) seen.push(d.sub);
  return seen;
}
function devicesAt(cat: string, group: string, sub: string) {
  return allDevs.filter(d => d.cat === cat && d.group === group && d.sub === sub);
}

export function EquipApp({ session }: { session: Session | null }) {
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (msg: string) => { setToast(msg); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2400); };

  const [store, setStore] = useState<Store>(() => {
    const { store: s, migrated } = initStore(localStorage);
    if (migrated > 0) queueMicrotask(() => notify(`已把旧版记录 ${migrated} 条迁移到新版（旧数据仍保留）`));
    return s as Store;
  });
  const api = React.useMemo(() => (session ? authedApi(localStorage) : null), [session && session.token]);
  const commitCount = useRef(0);
  const [syncMsg, setSyncMsg] = useState('');
  const commit = (next: Store) => {
    const ops = diffOps(store, next);
    setStore(next); saveStore(localStorage, next);
    if (api && ops.length) {
      commitCount.current++;
      pushOps({ storage: localStorage, api, ops })
        .then((r: any) => { if (r && !r.ok) setSyncMsg('有记录待同步（网络恢复后自动上传）'); })
        .catch(() => setSyncMsg('有记录待同步（网络恢复后自动上传）'));
    }
  };

  // Cloud sync: pull the current inspection day on mount / when the page becomes
  // visible / every minute, then flush any queued offline writes.
  useEffect(() => {
    if (!api) return;
    let alive = true;
    const sync = async () => {
      const before = commitCount.current;
      try {
        const merged = await pullAndMerge({ storage: localStorage, api, days: [inspectionDayKey()] });
        if (!alive) return;
        if (commitCount.current === before) setStore(merged as Store);
        const f = await flushQueue({ storage: localStorage, api });
        if (!alive) return;
        const left = loadQueue(localStorage).length;
        setSyncMsg(f.ok && !left ? '云端已同步' : `待同步 ${left} 条`);
      } catch { if (alive) setSyncMsg('暂时连不上云端，记录先存本机'); }
    };
    sync();
    const iv = setInterval(sync, 60000);
    const onVis = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [api]);

  // The device page always works on the CURRENT inspection day (rolls over at 01:00 Asia/Shanghai).
  const [day, setDay] = useState(inspectionDayKey);
  useEffect(() => {
    const check = () => { const k = inspectionDayKey(); setDay(prev => (prev === k ? prev : k)); };
    const iv = setInterval(check, 30000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); };
  }, []);
  useEffect(() => { setUndoSnap(null); }, [day]);

  const [selCat, setSelCat] = useState<string | null>(null);
  const [selGroup, setSelGroup] = useState<string | null>(null);
  const [selSub, setSelSub] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hiUid, setHiUid] = useState('');
  const [dialog, setDialog] = useState<{ uid: string; mode: 'new' | 'edit'; text: string } | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [undoSnap, setUndoSnap] = useState<{ day: string; map: Record<string, Rec>; label: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recs = dayRecords(store, day) as Record<string, Rec>;
  const counts = useMemo(() => countsForDay(store, day) as { per: Record<string, number>; total: number }, [store, day]);
  const groupFaults = (cat: string, group?: string, sub?: string) => {
    let n = 0;
    for (const uid of Object.keys(recs)) {
      const d = deviceByUid(uid);
      if (!d || d.cat !== cat) continue;
      if (group !== undefined && d.group !== group) continue;
      if (sub !== undefined && d.sub !== sub) continue;
      n++;
    }
    return n;
  };

  useEffect(() => {
    if (dialog && taRef.current) {
      const t = setTimeout(() => { const el = taRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 60);
      return () => clearTimeout(t);
    }
  }, [dialog]);

  const showUndo = (label: string, prevMap: Record<string, Rec>) => {
    setUndoSnap({ day, map: prevMap, label });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoSnap(null), 6000);
  };
  const doUndo = () => {
    if (!undoSnap) return;
    commit({ ...store, days: { ...store.days, [undoSnap.day]: undoSnap.map } });
    setUndoSnap(null);
    notify('已撤销');
  };

  const setDayRecs = (nextMap: Record<string, Rec>) => commit({ ...store, days: { ...store.days, [day]: nextMap } });

  const confirmDialog = () => {
    if (!dialog) return;
    const reason = dialog.text.trim();
    if (!reason) return;
    const d = deviceByUid(dialog.uid) as Dev;
    const prev = recs[dialog.uid];
    const rec: Rec = { name: d.name, path: pathOf(d), reason, time: prev ? prev.time : new Date().toISOString() };
    setDayRecs({ ...recs, [dialog.uid]: rec });
    setDialog(null);
    notify(dialog.mode === 'edit' ? `已更新 ${d.name} 的故障原因` : `已记录：${d.name}`);
    navigator.vibrate?.(8);
  };
  const uncheck = (d: Dev) => {
    const prevMap = { ...recs };
    const next = { ...recs }; delete next[d.uid];
    setDayRecs(next);
    showUndo(`已取消勾选 ${d.name}`, prevMap);
  };
  const clearTodayFaults = () => {
    if (!Object.keys(recs).length) return;
    if (!confirm(`清空今日（${dateCN(day)}）的全部故障记录？昨天的记录不会受影响。`)) return;
    const prevMap = { ...recs };
    setDayRecs({});
    showUndo('已清空今日故障', prevMap);
  };

  // One-tap "copy yesterday": pull yesterday's cloud records first (this page
  // normally syncs only today), then mark every one of them as faulted today.
  // The copies are ordinary records — afterwards the user can uncheck the
  // repaired ones or edit reasons as usual. Undo restores today's prior map.
  const [copyBusy, setCopyBusy] = useState(false);
  const copyYesterday = async () => {
    if (copyBusy) return;
    setCopyBusy(true);
    try {
      let base = store;
      if (api) {
        try {
          const merged = await pullAndMerge({ storage: localStorage, api, days: [shiftDay(day, -1)] });
          base = merged as Store;
          setStore(merged as Store);
        } catch {}
      }
      const plan = planCopyYesterday(base, day, new Date().toISOString());
      if (!plan.yesterdayCount) { notify('昨日没有故障记录'); return; }
      if (!plan.count) { notify('昨日的故障今天都已记录，无需复制'); return; }
      if (!confirm(`把昨日（${dateCN(plan.yesterdayKey)}）的 ${plan.count} 条故障复制到今日？复制后仍可逐条取消或修改。`)) return;
      const prevMap = { ...(dayRecords(base, day) as Record<string, Rec>) };
      commit({ ...base, days: { ...base.days, [day]: { ...prevMap, ...plan.add } } });
      showUndo(`已从昨日复制 ${plan.count} 条故障`, prevMap);
      notify(`已复制昨日故障 ${plan.count} 条`);
      navigator.vibrate?.(8);
    } finally { setCopyBusy(false); }
  };

  const jumpTo = (d: Dev) => {
    setSelCat(d.cat); setSelGroup(d.group); setSelSub(d.sub || null);
    setQuery(''); setHiUid(d.uid);
    setTimeout(() => document.getElementById(`eq2-dev-${d.uid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 90);
    setTimeout(() => setHiUid(''), 2200);
  };
  const back = () => {
    if (query) { setQuery(''); return; }
    if (selSub) setSelSub(null);
    else if (selGroup) setSelGroup(null);
    else if (selCat) setSelCat(null);
  };

  const q = query.trim().toLowerCase();
  const searchResults = q ? allDevs.filter(d => d.name.toLowerCase().includes(q) || `${d.cat} ${d.group} ${d.sub} ${d.name}`.toLowerCase().includes(q)) : [];

  const leafReady = !!selCat && !!selGroup && (subsOf(selCat, selGroup).length === 0 || selSub !== null);
  const leafDevices = leafReady ? devicesAt(selCat!, selGroup!, selSub || '') : [];

  const dialogDev = dialog ? (deviceByUid(dialog.uid) as Dev) : null;

  return (
    <div className="eq2-root">
      <div className="eq2-dayline">
        <span className="eq2-dayname">{`当前检查日：${dateCN(day)}`}</span>
        <span className="eq2-daycount">{`今日故障 ${counts.total} 台`}</span>
      </div>
      {session && <div className="eq2-sync">{syncMsg || '云端同步已开启'}</div>}

      <div className="eq2-search">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜设备编号或名称，如 7608 / Roof / 荷花灯" />
        {query && <button className="eq2-sclear" onClick={() => setQuery('')}>✕</button>}
      </div>

      {q ? (
        <div className="eq2-list">
          <div className="eq2-hint">{`找到 ${searchResults.length} 台设备（点一条直接定位）`}</div>
          {searchResults.slice(0, 80).map(d => (
            <button key={d.uid} className="eq2-srow" onClick={() => jumpTo(d)}>
              <span className="eq2-sname">{d.name}{recs[d.uid] ? ' · 已记故障' : ''}</span>
              <span className="eq2-spath">{`${d.cat} / ${d.group}${d.sub ? ` / ${d.sub}` : ''}`}</span>
            </button>
          ))}
          {searchResults.length > 80 && <div className="eq2-hint">结果太多，只显示前 80 条，请输入更完整的编号</div>}
        </div>
      ) : (
        <>
          <div className="eq2-crumb">
            {(selCat || selGroup || selSub) && <button className="eq2-back" onClick={back}>‹ 返回</button>}
            <span className="eq2-crumbpath">
              <span onClick={() => { setSelCat(null); setSelGroup(null); setSelSub(null); }}>设备目录</span>
              {selCat && <span onClick={() => { setSelGroup(null); setSelSub(null); }}>{` / ${selCat}`}</span>}
              {selGroup && <span onClick={() => setSelSub(null)}>{` / ${selGroup}`}</span>}
              {selSub && <span>{` / ${selSub}`}</span>}
            </span>
          </div>

          {!selCat && (
            <>
              <div className="eq2-list">
                {CATS.map((cat: string) => (
                  <button key={cat} className="eq2-lrow" onClick={() => { setSelCat(cat); setSelGroup(null); setSelSub(null); }}>
                    <span className="eq2-lname">{cat}</span>
                    {counts.per[cat] > 0 && <span className="eq2-badge">{`故障 ${counts.per[cat]}`}</span>}
                    <span className="eq2-lcount">{`${allDevs.filter(d => d.cat === cat).length} 台`}</span>
                    <span className="eq2-chev">›</span>
                  </button>
                ))}
              </div>
              <p className="eq2-note">每天凌晨 1:00 自动开始新一轮检查：今日状态全部恢复绿点，昨天的记录在「故障全览」里查看，不会丢失。</p>
              <div className="eq2-actions">
                <button className="eq2-copy" onClick={copyYesterday} disabled={copyBusy}>{copyBusy ? '复制中…' : '复制昨日故障'}</button>
                {counts.total > 0 && <button className="eq2-clear" onClick={clearTodayFaults}>清空今日故障</button>}
              </div>
            </>
          )}

          {selCat && !selGroup && (
            <div className="eq2-list">
              {groupsOf(selCat).map(g => {
                const f = groupFaults(selCat, g);
                return (
                  <button key={g} className="eq2-lrow" onClick={() => { setSelGroup(g); setSelSub(null); }}>
                    <span className="eq2-lname">{g}</span>
                    {f > 0 && <span className="eq2-badge">{`故障 ${f}`}</span>}
                    <span className="eq2-lcount">{`${allDevs.filter(d => d.cat === selCat && d.group === g).length} 台`}</span>
                    <span className="eq2-chev">›</span>
                  </button>
                );
              })}
            </div>
          )}

          {selCat && selGroup && !leafReady && (
            <div className="eq2-list">
              {subsOf(selCat, selGroup).map(sb => {
                const f = groupFaults(selCat, selGroup, sb);
                return (
                  <button key={sb} className="eq2-lrow" onClick={() => setSelSub(sb)}>
                    <span className="eq2-lname">{sb}</span>
                    {f > 0 && <span className="eq2-badge">{`故障 ${f}`}</span>}
                    <span className="eq2-lcount">{`${devicesAt(selCat, selGroup, sb).length} 台`}</span>
                    <span className="eq2-chev">›</span>
                  </button>
                );
              })}
            </div>
          )}

          {leafReady && (
            <div className="eq2-list">
              <div className="eq2-hint">{`共 ${leafDevices.length} 台 · 绿点正常、红点故障 · 点右侧方框记录故障，再点一次取消`}</div>
              {leafDevices.map(d => {
                const rec = recs[d.uid];
                return (
                  <div key={d.uid} id={`eq2-dev-${d.uid}`} className={'eq2-row' + (rec ? ' bad' : '') + (hiUid === d.uid ? ' hi' : '')}>
                    <div className="eq2-rowmain">
                      <div className="eq2-dname">{d.name}<span className={'eq2-dot' + (rec ? ' bad' : '')} /></div>
                      {rec && <div className="eq2-reason">{`故障原因：${rec.reason}`}</div>}
                      {rec && rec.reporter && <div className="eq2-reporter">{`记录人：${rec.reporter}`}</div>}
                    </div>
                    {rec && <button className="eq2-edit" onClick={() => setDialog({ uid: d.uid, mode: 'edit', text: rec.reason })}>编辑原因</button>}
                    <button className={'eq2-cb' + (rec ? ' on' : '')} aria-label={rec ? '取消勾选' : '勾选故障'} onClick={() => rec ? uncheck(d) : setDialog({ uid: d.uid, mode: 'new', text: '' })}>{rec ? '✓' : ''}</button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {dialog && dialogDev && (
        <div className="eq2-mask" onClick={e => { if (e.target === e.currentTarget) setDialog(null); }}>
          <div className="eq2-dialog">
            <h3>{dialog.mode === 'edit' ? '编辑故障原因' : '设备故障记录'}</h3>
            <div className="eq2-d-row"><span className="eq2-d-k">设备：</span>{dialogDev.name}</div>
            <div className="eq2-d-row"><span className="eq2-d-k">位置：</span>{pathOf(dialogDev)}</div>
            <div className="eq2-d-cap">故障原因：</div>
            <div className="eq2-quick">
              {QUICK_REASONS.map((qq: string) => (
                <button key={qq} className={dialog.text === qq ? 'on' : ''} onClick={() => setDialog({ ...dialog, text: qq })}>{qq}</button>
              ))}
            </div>
            <textarea ref={taRef} value={dialog.text} onChange={e => setDialog({ ...dialog, text: e.target.value })} placeholder="请输入该设备的故障原因……" rows={3} />
            <div className="eq2-d-btns">
              <button onClick={() => setDialog(null)}>取消</button>
              <button className="ok" disabled={!dialog.text.trim()} onClick={confirmDialog}>{dialog.mode === 'edit' ? '保存修改' : '确定并记录'}</button>
            </div>
          </div>
        </div>
      )}

      {undoSnap && (
        <div className="eq2-undo">
          <span>{undoSnap.label}</span>
          <button onClick={doUndo}>撤销</button>
        </div>
      )}
      {toast && <div className="eq2-toast">{toast}</div>}
    </div>
  );
}
