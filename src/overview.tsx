import React, { useState, useEffect, useMemo, useRef } from 'react';
// @ts-ignore plain ESM data with unit tests
import { DEVICES } from './devices.mjs';
// @ts-ignore plain ESM logic with unit tests
import { deviceByUid, inspectionDayKey, dateCN, initStore, dayRecords, recoveredFor, reportText, reportSegments, csvAll, fmtClock, shiftDay } from './equipmodel.mjs';
// @ts-ignore plain ESM logic with unit tests
import { authedApi, pullAndMerge, apiGetShows } from './cloud.mjs';
// @ts-ignore bundled fallback for the shows band on the report image
import { SHOWS } from './showdata.mjs';

type Rec = { name: string; path: string; reason: string; time: string; reporter?: string; updatedAt?: string };
type Session = { token: string; username: string; name: string; mustChange: boolean };
type Store = { version: number; days: Record<string, Record<string, Rec>> };
type Dev = { uid: string; cat: string; group: string; sub: string; name: string };

const allDevs = DEVICES as Dev[];
const shortName = (d: Dev) => { const segs = reportSegments(d); return segs[segs.length - 1]; };

type GroupBlock = { key: string; title: string; items: { d: Dev; text: string; time?: string; bad: boolean; reporter?: string }[] };
function groupBlocks(items: { d: Dev; text: string; time?: string; bad: boolean; reporter?: string }[]): GroupBlock[] {
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

const IMG_FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = []; let cur = '';
  for (const ch of text) {
    if (cur && ctx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 2);
}
function beijingNowLabel(): string {
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const g = (t: string) => { const p = parts.find(x => x.type === t); return p ? p.value : ''; };
  return `${g('year')}年${g('month')}月${g('day')}日 ${g('hour')}:${g('minute')}`;
}
type ImgData = {
  dateLabel: string; genTime: string;
  band: { label: string; text: string } | null;
  faultCount: number; recovCount: number;
  faultGroups: { title: string; items: { name: string; meta: string }[] }[];
  recovItems: { name: string; meta: string }[];
};
function drawReportImage(data: ImgData): string {
  const W = 1080, PAD = 64, CW = W - PAD * 2;
  const meas = document.createElement('canvas').getContext('2d')!;
  const compact = data.faultCount + data.recovCount > 110;
  const rowH = compact ? 80 : 96, recH = compact ? 76 : 88;
  meas.font = `29px ${IMG_FONT}`;
  const fGroups = data.faultGroups.map(g => ({ title: g.title, items: g.items.map(it => ({ name: it.name, metaLines: wrapLines(meas, it.meta, CW - 44) })) }));
  meas.font = `27px ${IMG_FONT}`;
  const rItems = data.recovItems.map(it => ({ name: it.name, metaLines: wrapLines(meas, it.meta, CW - 44) }));
  let H = 56 + 92 + 58 + 50 + (data.band ? 96 : 10) + 84 + 30 + 66;
  if (!fGroups.length) H += 56;
  for (const g of fGroups) H += 64 + g.items.reduce((a, it) => a + rowH + (it.metaLines.length > 1 ? 38 : 0), 0) + 14;
  H += 30 + 66;
  if (!rItems.length) H += 56;
  H += rItems.reduce((a, it) => a + recH + (it.metaLines.length > 1 ? 36 : 0), 0);
  H += 40 + 18 + 60 + 56;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0C2249'); grad.addColorStop(1, '#07142E');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#D8B25A'; ctx.fillRect(0, 0, W, 6);
  ctx.textBaseline = 'top';
  const GOLD = '#D8B25A', TXT = '#F2F5FA', DIM = '#9FB0CC';
  let y = 56;
  ctx.fillStyle = TXT; ctx.font = `bold 62px ${IMG_FONT}`;
  ctx.fillText('设备检查结果', PAD, y); y += 92;
  ctx.fillStyle = DIM; ctx.font = `33px ${IMG_FONT}`;
  ctx.fillText(`检查日期：${data.dateLabel}`, PAD, y); y += 58;
  ctx.fillStyle = '#7A8CAF'; ctx.font = `29px ${IMG_FONT}`;
  ctx.fillText(`生成时间：${data.genTime}`, PAD, y); y += 50;
  if (data.band) {
    rr(ctx, PAD, y, CW, 72, 12); ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = `bold 32px ${IMG_FONT}`;
    ctx.fillStyle = GOLD; ctx.fillText(data.band.label, PAD + 22, y + 16);
    const lx = PAD + 22 + ctx.measureText(data.band.label).width + 36;
    ctx.fillStyle = TXT;
    if (ctx.measureText(data.band.text).width > PAD + CW - lx - 10) ctx.font = `bold 27px ${IMG_FONT}`;
    ctx.fillText(data.band.text, lx, y + 16);
    y += 96;
  } else y += 10;
  const pill = (x: number, text: string, fill: string, color: string) => {
    ctx.font = `bold 32px ${IMG_FONT}`;
    const w = ctx.measureText(text).width + 48;
    rr(ctx, x, y, w, 56, 28); ctx.fillStyle = fill; ctx.fill();
    ctx.fillStyle = color; ctx.fillText(text, x + 24, y + 9);
    return x + w + 20;
  };
  let px = pill(PAD, `当前故障 ${data.faultCount} 台`, '#3A1E22', '#FF8A7A');
  px = pill(px, `已恢复 ${data.recovCount} 台`, '#14301F', '#6FD3A7');
  y += 84 + 30;
  const section = (label: string) => {
    ctx.fillStyle = GOLD; ctx.fillRect(PAD, y + 6, 8, 46);
    ctx.font = `bold 40px ${IMG_FONT}`; ctx.fillText(label, PAD + 26, y);
    y += 66;
  };
  section('【当前故障】');
  if (!fGroups.length) { ctx.fillStyle = DIM; ctx.font = `32px ${IMG_FONT}`; ctx.fillText('无故障记录', PAD, y); y += 56; }
  for (const g of fGroups) {
    rr(ctx, PAD, y, CW, 52, 10); ctx.fillStyle = '#102449'; ctx.fill();
    ctx.font = `bold 33px ${IMG_FONT}`;
    if (ctx.measureText(g.title).width > CW - 40) ctx.font = `bold 29px ${IMG_FONT}`;
    ctx.fillStyle = '#E8C97A'; ctx.fillText(g.title, PAD + 20, y + 8);
    y += 64;
    for (const it of g.items) {
      ctx.beginPath(); ctx.arc(PAD + 15, y + 25, 9, 0, Math.PI * 2); ctx.fillStyle = '#FF6B5E'; ctx.fill();
      ctx.fillStyle = TXT; ctx.font = `bold 37px ${IMG_FONT}`; ctx.fillText(it.name, PAD + 44, y);
      ctx.fillStyle = DIM; ctx.font = `29px ${IMG_FONT}`;
      it.metaLines.forEach((ln, i) => ctx.fillText(ln, PAD + 44, y + 50 + i * 38));
      y += rowH + (it.metaLines.length > 1 ? 38 : 0);
    }
    y += 14;
  }
  y += 30;
  section('【已恢复】');
  if (!rItems.length) { ctx.fillStyle = DIM; ctx.font = `32px ${IMG_FONT}`; ctx.fillText('无', PAD, y); y += 56; }
  for (const it of rItems) {
    ctx.beginPath(); ctx.arc(PAD + 15, y + 23, 9, 0, Math.PI * 2); ctx.fillStyle = '#4CC38A'; ctx.fill();
    ctx.fillStyle = TXT; ctx.font = `bold 35px ${IMG_FONT}`; ctx.fillText(it.name, PAD + 44, y);
    ctx.fillStyle = DIM; ctx.font = `27px ${IMG_FONT}`;
    it.metaLines.forEach((ln, i) => ctx.fillText(ln, PAD + 44, y + 46 + i * 36));
    y += recH + (it.metaLines.length > 1 ? 36 : 0);
  }
  y += 40;
  ctx.fillStyle = '#1E345C'; ctx.fillRect(PAD, y, CW, 2); y += 18;
  ctx.fillStyle = DIM; ctx.font = `30px ${IMG_FONT}`;
  const ft = '—— 检查结束 ——';
  ctx.fillText(ft, (W - ctx.measureText(ft).width) / 2, y);
  return cv.toDataURL('image/png');
}

export function OverviewApp({ session }: { session: Session | null }) {
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (msg: string) => { setToast(msg); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2400); };

  const [store, setStore] = useState<Store>(() => initStore(localStorage).store as Store);
  const api = React.useMemo(() => (session ? authedApi(localStorage) : null), [session && session.token]);
  const [currentDay, setCurrentDay] = useState(inspectionDayKey);
  const [showsList, setShowsList] = useState<any[]>(SHOWS);
  const [imgUrl, setImgUrl] = useState('');
  const [imgBusy, setImgBusy] = useState(false);
  useEffect(() => { apiGetShows().then((l: any) => { if (Array.isArray(l) && l.length) setShowsList(l); }).catch(() => {}); }, []);
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

  // Pull the selected day and the day before it (needed for 已恢复) from the cloud.
  useEffect(() => {
    if (!api) return;
    let alive = true;
    pullAndMerge({ storage: localStorage, api, days: [selDay, shiftDay(selDay, -1)] })
      .then((merged: any) => { if (alive) setStore(merged as Store); })
      .catch(() => {});
    return () => { alive = false; };
  }, [api, selDay]);

  const recs = dayRecords(store, selDay) as Record<string, Rec>;
  const faults = useMemo(() => allDevs.filter(d => recs[d.uid]), [recs]);
  const recov = useMemo(() => recoveredFor(store, selDay) as { d: Dev; prevReason: string }[], [store, selDay]);
  const isToday = selDay === currentDay;

  const faultBlocks = useMemo(() => groupBlocks(faults.map(d => ({ d, text: recs[d.uid].reason, time: recs[d.uid].time, bad: true, reporter: recs[d.uid].reporter }))), [faults, recs]);
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
  const genImage = () => {
    const entry = showsList.find((x: any) => x.date === selDay);
    const data: ImgData = {
      dateLabel: dateCN(selDay),
      genTime: beijingNowLabel(),
      band: entry ? { label: isToday ? '今日场次' : '当日场次', text: entry.text } : null,
      faultCount: faults.length,
      recovCount: recov.length,
      faultGroups: faultBlocks.map(b => ({
        title: b.title,
        items: b.items.map(it => ({ name: shortName(it.d), meta: `故障原因：${it.text}${it.time ? ' · ' + fmtClock(it.time) : ''}${it.reporter ? ' · 记录人：' + it.reporter : ''}` })),
      })),
      recovItems: recov.map(({ d, prevReason }) => ({
        name: shortName(d),
        meta: `${[d.cat, d.group, d.sub].filter(Boolean).join(' · ')} · 状态：已恢复 · 上一检查日故障：${prevReason}`,
      })),
    };
    setImgBusy(true);
    setTimeout(() => {
      try { setImgUrl(drawReportImage(data)); }
      catch { notify('生成失败，请再试一次'); }
      setImgBusy(false);
    }, 30);
  };
  const canShareFiles = typeof navigator !== 'undefined' && 'canShare' in navigator;
  const shareImg = async () => {
    try {
      const blob = await (await fetch(imgUrl)).blob();
      const file = new File([blob], '设备检查结果.png', { type: 'image/png' });
      if ((navigator as any).canShare({ files: [file] })) { await (navigator as any).share({ files: [file] }); return; }
      notify('当前浏览器不支持直接分享，长按图片即可保存');
    } catch { /* user cancelled the share sheet */ }
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
          {it.bad && it.reporter && <span className="ov-rep">{it.reporter}</span>}
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
      <button className="ov-imgbtn" onClick={genImage} disabled={imgBusy}>{imgBusy ? '生成中…' : '一键生成图片'}</button>
      <button className="ov-csv" onClick={exportCsv}>导出全部历史 CSV</button>
      <p className="ov-note">{isToday
        ? '「已恢复」是自动对比出来的：昨天有故障、今天没再勾选的设备，只在恢复后的第一个检查日显示。'
        : '历史日期只能查看，不能在这里修改；要处理今天的故障，请去「设备」页。'}</p>
      {imgUrl && (
        <div className="ov-imgmask" onClick={() => setImgUrl('')}>
          <div className="ov-imgbox" onClick={e => e.stopPropagation()}>
            <img src={imgUrl} alt="设备检查结果图片" />
            <div className="ov-imghint">长按图片即可存储到照片；也可以点下面按钮分享保存</div>
            {canShareFiles && <button className="ov-copy" onClick={shareImg}>分享 / 保存到相册</button>}
            <button className="ov-csv" onClick={() => setImgUrl('')}>关闭</button>
          </div>
        </div>
      )}
      {toast && <div className="eq2-toast">{toast}</div>}
    </div>
  );
}
