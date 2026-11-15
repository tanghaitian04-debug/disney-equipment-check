import React, { useState, useEffect, useMemo, useRef } from 'react';
// @ts-ignore plain ESM data with unit tests
import { DEVICES } from './devices.mjs';
// @ts-ignore plain ESM logic with unit tests
import { deviceByUid, inspectionDayKey, dateCN, initStore, dayRecords, recoveredFor, reportText, reportSegments, csvAll, fmtClock } from './equipmodel.mjs';

type Rec = { name: string; path: string; reason: string; time: string };
type Store = { version: number; days: Record<string, Record<string, Rec>> };
type Dev = { uid: string; cat: string; group: string; sub: string; name: string };

const allDevs = DEVICES as Dev[];
const shortName = (d: Dev) => { const segs = reportSegments(d); return segs[segs.length - 1]; };

type GroupBlock = { key: string; title: string; items: { d: Dev; text: string; time?: string; bad: boolean }[] };
function groupBlocks(items: { d: Dev; text: string; time?: string; bad: boolean }[]): GroupBlock[] {
  const blocks: GroupBlock[] = [];
  const byKey = new Map<string, GroupBlock>();
  for (const it of items) {
    const key = `${it.d.cat}|${it.d.group}|${it.d.sub}`;
    let b = byKey.get(key);
    if (!b) {
      b = { key, title: [it.d.cat, it.d.group, it.d.sub].filter(Boolean).join(' · '), items: [] };
      byKey.set(key, b); blocks.push(b);
    }
    b.items.push(it);
  }
  return blocks;
}

export function OverviewApp() {
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (msg: string) => { setToast(msg); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2400); };

  const [store] = useState<Store>(() => initStore(localStorage).store as Store);
  const [currentDay, setCurrentDay] = useState(inspectionDayKey);
  const [selDay, setSelDay] = useState(inspectionDayKey);
  const followRef = useRef(true);

  useEffect(() => {
    const check = () => {
      const k = inspectionDayKey();
      setCurrentDay(prev => (prev === k ? prev : k));
      if (followRef.current) setSelDay(prev => (prev === k ? prev : k));
    };
    const iv = setInterval(check, 30000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); };
  }, []);

  const recs = dayRecords(store, selDay) as Record<string, Rec>;
  const faults = useMemo(() => allDevs.filter(d => recs[d.uid]), [recs]);
  const recov = useMemo(() => recoveredFor(store, selDay) as { d: Dev; prevReason: string }[], [store, selDay]);
  const isToday = selDay === currentDay;

  const faultBlocks = useMemo(() => groupBlocks(faults.map(d => ({ d, text: recs[d.uid].reason, time: recs[d.uid].time, bad: true }))), [faults, recs]);
  const recovBlocks = useMemo(() => groupBlocks(recov.map(({ d, prevReason }) => ({ d, text: `已恢复（昨日：${prevReason}）`, bad: false }))), [recov]);

  const pickDay = (v: string) => {
    if (!v) return;
    setSelDay(v);
    followRef.current = v === inspectionDayKey();
  };

  const copyReport = async () => {
    const text = reportText(selDay, store);
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

  const renderBlocks = (blocks: GroupBlock[]) => blocks.map(b => (
    <div key={b.key} className="ov-group">
      <div className="ov-gtitle">{`【${b.title}】`}</div>
      {b.items.map(it => (
        <div key={it.d.uid} className="ov-line">
          <span className={'ov-dot' + (it.bad ? ' bad' : '')} />
          <span className="ov-name">{shortName(it.d)}</span>
          <span className={'ov-text' + (it.bad ? '' : ' ok')}>{it.text}</span>
          {it.bad && it.time && <span className="ov-time">{fmtClock(it.time)}</span>}
        </div>
      ))}
    </div>
  ));

  return (
    <div className="ov-root">
      <div className="ov-head">
        <h2 className="ov-title">设备故障全览</h2>
        <input className="ov-date" type="date" value={selDay} max={currentDay} onChange={e => pickDay(e.target.value)} aria-label="选择检查日期" />
      </div>
      <div className="ov-dateline">
        <span className="ov-datebig">{dateCN(selDay)}</span>
        {isToday && <span className="ov-todaychip">当前检查日</span>}
      </div>
      <div className="ov-stats">{`故障 ${faults.length} 台 · 已恢复 ${recov.length} 台 · 设备总数 ${allDevs.length}`}</div>

      <div className="ov-card">
        <div className="ov-cardtitle">{`${dateCN(selDay)}｜设备检查结果`}</div>
        <div className="ov-sect">{`${isToday ? '今日' : '当日'}故障：${faults.length}台`}</div>
        {faults.length ? renderBlocks(faultBlocks) : <div className="ov-none">无故障记录</div>}
        <div className="ov-sect">{`${isToday ? '今日' : '当日'}已恢复：${recov.length}台`}</div>
        {recov.length ? renderBlocks(recovBlocks) : <div className="ov-none">无</div>}
      </div>

      <button className="ov-copy" onClick={copyReport}>一键复制报告</button>
      <button className="ov-csv" onClick={exportCsv}>导出全部历史 CSV</button>
      <p className="ov-note">{isToday
        ? '「已恢复」是自动对比出来的：昨天有故障、今天没再勾选的设备，只在恢复后的第一个检查日显示。'
        : '历史日期只能查看，不能在这里修改；要处理今天的故障，请去「设备」页。'}</p>
      {toast && <div className="eq2-toast">{toast}</div>}
    </div>
  );
}
