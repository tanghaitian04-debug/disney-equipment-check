import React, { useState, useEffect, useMemo, useRef } from 'react';
// @ts-ignore plain ESM data with unit tests
import { DEVICES, CATS } from './devices.mjs';
// @ts-ignore plain ESM logic with unit tests
import { QUICK_REASONS, deviceByUid, pathOf, dayKey, shiftDay, fmtTime, loadStore, saveStore, migrateV1, dayRecords, countsForDay, reportText, csvAll } from './equipmodel.mjs';

type Rec = { name: string; path: string; reason: string; time: string };
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

export function EquipApp() {
  const [todayKey] = useState(dayKey);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (msg: string) => { setToast(msg); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2400); };

  const [store, setStore] = useState<Store>(() => {
    const existing = loadStore(localStorage);
    if (existing) return existing as Store;
    const { store: mig, count } = migrateV1(localStorage);
    saveStore(localStorage, mig);
    if (count > 0) queueMicrotask(() => notify(`已把旧版记录 ${count} 条迁移到新版（旧数据仍保留）`));
    return mig as Store;
  });
  const commit = (next: Store) => { setStore(next); saveStore(localStorage, next); };

  const [day, setDay] = useState(todayKey);
  const [view, setView] = useState<'catalog' | 'records'>('catalog');
  const [selCat, setSelCat] = useState<string | null>(null);
  const [selGroup, setSelGroup] = useState<string | null>(null);
  const [selSub, setSelSub] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hiUid, setHiUid] = useState('');
  const [dialog, setDialog] = useState<{ uid: string; mode: 'new' | 'edit'; text: string } | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [undoSnap, setUndoSnap] = useState<{ day: string; map: Record<string, Rec>; label: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [recCat, setRecCat] = useState('全部');
  const [recGroup, setRecGroup] = useState('全部');
  const [recQuery, setRecQuery] = useState('');

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
  const deleteRec = (d: Dev) => {
    const prevMap = { ...recs };
    const next = { ...recs }; delete next[d.uid];
    setDayRecs(next);
    showUndo(`已删除 ${d.name} 的记录`, prevMap);
  };
  const clearDay = () => {
    if (!Object.keys(recs).length) return;
    if (!confirm(`清空 ${day} 的全部故障记录？`)) return;
    const prevMap = { ...recs };
    setDayRecs({});
    showUndo(`已清空 ${day} 的记录`, prevMap);
  };

  const jumpTo = (d: Dev) => {
    setSelCat(d.cat); setSelGroup(d.group); setSelSub(d.sub || null);
    setQuery(''); setView('catalog'); setHiUid(d.uid);
    setTimeout(() => document.getElementById(`eq2-dev-${d.uid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 90);
    setTimeout(() => setHiUid(''), 2200);
  };
  const back = () => {
    if (query) { setQuery(''); return; }
    if (selSub) setSelSub(null);
    else if (selGroup) setSelGroup(null);
    else if (selCat) setSelCat(null);
  };

  const copyReport = async () => {
    const text = reportText(day, store);
    try { await navigator.clipboard.writeText(text); notify('报告已复制，去微信群粘贴发送就行'); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove();
      notify(ok ? '报告已复制，去微信群粘贴发送就行' : '复制失败，请再试一次');
    }
  };
  const exportCsv = () => {
    const blob = new Blob([csvAll(store)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = '设备故障记录.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    notify('已导出全部历史记录 CSV');
  };

  const q = query.trim().toLowerCase();
  const searchResults = q ? allDevs.filter(d => d.name.toLowerCase().includes(q) || `${d.cat} ${d.group} ${d.sub} ${d.name}`.toLowerCase().includes(q)) : [];

  const leafReady = !!selCat && !!selGroup && (subsOf(selCat, selGroup).length === 0 || selSub !== null);
  const leafDevices = leafReady ? devicesAt(selCat!, selGroup!, selSub || '') : [];

  const recEntries = useMemo(() => {
    return Object.keys(recs).map(uid => ({ d: deviceByUid(uid) as Dev, r: recs[uid] })).filter(x => x.d)
      .sort((a, b) => Date.parse(b.r.time) - Date.parse(a.r.time));
  }, [recs]);
  const recGroupsPresent = useMemo(() => {
    const seen: string[] = [];
    for (const { d } of recEntries) if ((recCat === '全部' || d.cat === recCat) && !seen.includes(d.group)) seen.push(d.group);
    return seen;
  }, [recEntries, recCat]);
  const recFiltered = recEntries.filter(({ d, r }) =>
    (recCat === '全部' || d.cat === recCat) &&
    (recGroup === '全部' || d.group === recGroup) &&
    (!recQuery.trim() || `${d.name} ${d.cat} ${d.group} ${d.sub} ${r.reason}`.toLowerCase().includes(recQuery.trim().toLowerCase())));

  const dialogDev = dialog ? (deviceByUid(dialog.uid) as Dev) : null;

  return (
    <div className="eq2-root">
      <div className="eq2-datebar">
        <button className="eq2-arrow" onClick={() => { setDay(shiftDay(day, -1)); setUndoSnap(null); }}>‹</button>
        <span className="eq2-day">{day}{day === todayKey ? ' · 今天' : ''}</span>
        <button className="eq2-arrow" onClick={() => { setDay(shiftDay(day, 1)); setUndoSnap(null); }}>›</button>
        {day !== todayKey && <button className="eq2-today" onClick={() => setDay(todayKey)}>回到今天</button>}
        <span className="eq2-daycount">{`故障 ${counts.total} 台`}</span>
      </div>

      <div className="eq2-seg">
        <button className={view === 'catalog' ? 'on' : ''} onClick={() => setView('catalog')}>设备目录</button>
        <button className={view === 'records' ? 'on' : ''} onClick={() => setView('records')}>{`故障记录${counts.total ? ` (${counts.total})` : ''}`}</button>
      </div>

      {view === 'catalog' && (
        <>
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
                  <div className="eq2-hint">{`共 ${leafDevices.length} 台 · 点右侧方框记录故障，再点一次取消`}</div>
                  {leafDevices.map(d => {
                    const rec = recs[d.uid];
                    return (
                      <div key={d.uid} id={`eq2-dev-${d.uid}`} className={'eq2-row' + (rec ? ' bad' : '') + (hiUid === d.uid ? ' hi' : '')}>
                        <div className="eq2-rowmain">
                          <div className="eq2-dname">{d.name}</div>
                          {rec && <div className="eq2-reason">{`故障原因：${rec.reason}`}</div>}
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
        </>
      )}

      {view === 'records' && (
        <>
          <button className="eq2-copy" onClick={copyReport}>{`复制本次故障报告（${counts.total} 台）`}</button>
          <div className="eq2-recfilters">
            <div className="eq2-catchips">
              {['全部', ...CATS].map((c: string) => (
                <button key={c} className={recCat === c ? 'on' : ''} onClick={() => { setRecCat(c); setRecGroup('全部'); }}>{c}</button>
              ))}
            </div>
            <div className="eq2-rfrow">
              <select className="eq2-gsel" value={recGroup} onChange={e => setRecGroup(e.target.value)}>
                <option value="全部">全部位置（分组）</option>
                {recGroupsPresent.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <input className="eq2-rsearch" value={recQuery} onChange={e => setRecQuery(e.target.value)} placeholder="搜设备或原因" />
            </div>
          </div>
          {recFiltered.length === 0 && <div className="eq2-empty">{counts.total ? '没有符合筛选条件的记录' : '暂无故障记录。去设备目录里勾选故障设备，这里会自动汇总。'}</div>}
          {recFiltered.map(({ d, r }) => (
            <div key={d.uid} className="eq2-rec">
              <div className="eq2-rec-top"><span className="eq2-rec-name">{r.name}</span><span className="eq2-rec-time">{fmtTime(r.time)}</span></div>
              <div className="eq2-rec-path">{r.path}</div>
              <div className="eq2-rec-reason">{`故障原因：${r.reason}`}</div>
              <div className="eq2-rec-btns">
                <button onClick={() => setDialog({ uid: d.uid, mode: 'edit', text: r.reason })}>编辑原因</button>
                <button className="del" onClick={() => deleteRec(d)}>删除</button>
              </div>
            </div>
          ))}
          <div className="eq2-recfoot">
            <button onClick={exportCsv}>导出全部历史 CSV</button>
            <button className="danger" onClick={clearDay}>清空当天记录</button>
          </div>
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
