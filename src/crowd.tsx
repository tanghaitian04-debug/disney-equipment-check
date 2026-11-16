import React, { useState, useEffect, useCallback } from 'react';
// @ts-ignore plain ESM api client
import { apiGetCrowd } from './cloud.mjs';
// @ts-ignore pure crowd helpers with unit tests
import { rideZh, fmtNum, pctChange, fmtPct, axisSlots, alignSeries, niceCeil, nextSlotLabel, slotAgeMin } from './crowdlogic.mjs';

// Crowd page: park heat estimated server-side from Queue-Times waits
// (heat = sum of open rides' wait minutes x coefficient), collected by a
// cloud timer every 30 minutes into crowd_history. This page only reads.
// The heat is an algorithmic estimate, never an official attendance figure.

const BLUE = '#4da3ff', GREEN = '#3ecf6f', PURPLE = '#c792ea';
function pad(n: number) { return String(n).padStart(2, '0'); }
function hm(iso: any): string { const d = new Date(iso); return isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function yLabel(v: number): string { return v >= 10000 ? `${v / 10000}万` : `${v}`; }

function Chart({ today, yesterday, lastWeek, sel, onSel }: any) {
  const slots = axisSlots();
  const mT = alignSeries(today), mY = alignSeries(yesterday), mW = alignSeries(lastWeek);
  let maxV = 0;
  for (const m of [mT, mY, mW]) for (const v of m.values()) if (v > maxV) maxV = v;
  const top = niceCeil(maxV);
  const W = 340, H = 196, PL = 36, PR = 6, PT = 10, PB = 22;
  const PW = W - PL - PR, PH = H - PT - PB;
  const X = (i: number) => PL + (i * PW) / (slots.length - 1);
  const Y = (v: number) => PT + PH - (v / top) * PH;
  const line = (m: Map<string, number>) => {
    const segs: string[] = [];
    let cur: string[] = [];
    slots.forEach((t, i) => {
      const v = m.get(t);
      if (v == null) { if (cur.length) { segs.push(cur.join(' ')); cur = []; } return; }
      cur.push(`${i === 0 || cur.length === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
    });
    if (cur.length) segs.push(cur.join(' '));
    return segs;
  };
  const selIdx = sel ? slots.indexOf(sel) : -1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="客流趋势图">
      {[0, 0.5, 1].map(f => (
        <g key={f}>
          <line x1={PL} x2={W - PR} y1={PT + PH * (1 - f)} y2={PT + PH * (1 - f)} stroke="rgba(255,255,255,.09)" strokeWidth="1" />
          <text x={PL - 5} y={PT + PH * (1 - f) + 3} textAnchor="end" fontSize="8.5" fill="#8fa0bd">{yLabel(Math.round(top * f))}</text>
        </g>
      ))}
      {slots.map((t, i) => {
        const v = mT.get(t);
        if (v == null) return null;
        return <rect key={t} x={X(i) - 3.4} y={Y(v)} width={6.8} height={PT + PH - Y(v)} rx={1.2} fill={BLUE} opacity={selIdx === i ? 1 : 0.85} />;
      })}
      {line(mY).map((d, i) => <path key={'y' + i} d={d} fill="none" stroke={GREEN} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />)}
      {line(mW).map((d, i) => <path key={'w' + i} d={d} fill="none" stroke={PURPLE} strokeWidth="1.8" strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" />)}
      {selIdx >= 0 && <line x1={X(selIdx)} x2={X(selIdx)} y1={PT} y2={PT + PH} stroke="rgba(255,255,255,.35)" strokeWidth="1" />}
      {selIdx >= 0 && slots.map((t, i) => i !== selIdx ? null : (
        <g key={'s' + t}>
          {[[mT, BLUE], [mY, GREEN], [mW, PURPLE]].map(([m, c]: any, k) => {
            const v = m.get(t);
            return v == null ? null : <circle key={k} cx={X(i)} cy={Y(v)} r={3} fill={c} stroke="#0a1730" strokeWidth="1" />;
          })}
        </g>
      ))}
      {slots.map((t, i) => (
        <rect key={'hit' + t} x={X(i) - PW / slots.length / 2} y={PT} width={PW / slots.length} height={PH} fill="transparent" onClick={() => onSel(t)} />
      ))}
      {slots.map((t, i) => {
        const hh = Number(t.slice(0, 2));
        if (!(t.endsWith(':00') && hh % 2 === 0) && t !== '21:00') return null;
        return <text key={'x' + t} x={X(i)} y={H - 6} textAnchor="middle" fontSize="8.5" fill="#8fa0bd">{t}</text>;
      })}
    </svg>
  );
}

export function CrowdPanel() {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [netFail, setNetFail] = useState(false);
  const [sel, setSel] = useState<string>('');
  const load = useCallback(async () => {
    setBusy(true);
    const r = await apiGetCrowd();
    if (r) { setData(r); setNetFail(false); } else { setNetFail(true); }
    setBusy(false);
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const head = (
    <div className="wx-head">
      <span className="wx-title">实时客流</span>
      <button type="button" className="wx-refresh" disabled={busy} onClick={load}>{busy ? '刷新中…' : '刷新'}</button>
    </div>
  );

  if (!data) {
    return <div className="wx-card">{head}<div className="wx-big">{netFail ? '客流数据暂不可用' : '正在获取客流数据…'}</div></div>;
  }
  const latest = data.latest;
  if (!latest) {
    return (<div className="wx-card">{head}
      <div className="wx-big">暂无客流数据</div>
      <div className="wx-note2">云端每30分钟自动采集一次真实排队时间并计算热度，首次采集完成后这里会自动显示。</div>
    </div>);
  }

  const now = Date.now();
  const age = slotAgeMin(latest.slotMs, now);
  const stale = age != null && age > 45;
  const cmpY = pctChange(latest.heat, data.compare ? data.compare.yesterday : null);
  const cmpW = pctChange(latest.heat, data.compare ? data.compare.lastWeek : null);
  const rides = (Array.isArray(latest.rides) ? [...latest.rides] : []).sort((a: any, b: any) => {
    if (!!a.valid !== !!b.valid) return a.valid ? -1 : 1;
    return (b.wait || 0) - (a.wait || 0);
  });
  const mT = alignSeries(data.today), mY = alignSeries(data.yesterday), mW = alignSeries(data.lastWeek);
  const selTip = sel ? `${sel} · 今天 ${mT.has(sel) ? fmtNum(mT.get(sel)) : '–'} · 昨天 ${mY.has(sel) ? fmtNum(mY.get(sel)) : '–'} · 上周 ${mW.has(sel) ? fmtNum(mW.get(sel)) : '–'}` : '点图上任意时间，看该时段三天热度';

  return (<>
    <div className="wx-card">
      {head}
      <div className="cd-heat">
        <div>
          <div className="cd-num">{fmtNum(latest.heat)}</div>
          <div className="cd-cap">算法估算热度，非实际入园人数</div>
        </div>
        <div className="cd-cmp">
          <span>昨日<b>{fmtPct(cmpY)}</b></span>
          <span>上周同日<b>{fmtPct(cmpW)}</b></span>
        </div>
      </div>
      <div className="wx-meta">{`有效项目 ${latest.rideCount} 个 · 排队总和 ${fmtNum(latest.sumWait)} 分钟 · ${latest.date} ${latest.time} 时段`}</div>
      {stale && <div className="wx-meta" style={{ color: 'var(--gold)' }}>{`数据已过期：以上为最近有效值（${latest.date} ${latest.time}），云端采集可能暂时中断`}</div>}
    </div>

    <div className="wx-card">
      <div className="wx-head"><span className="wx-title">客流趋势</span></div>
      <div className="cd-legend">
        <span><i style={{ background: BLUE }} />今天</span>
        <span><i style={{ background: GREEN }} />昨天</span>
        <span><i style={{ background: PURPLE }} />上周同日</span>
      </div>
      <Chart today={data.today} yesterday={data.yesterday} lastWeek={data.lastWeek} sel={sel} onSel={setSel} />
      <div className="cd-tip">{selTip}</div>
      <div className="wx-foot">每30分钟采集一次真实排队时间绘制；尚未采集或缺失的时段不显示、不补值。</div>
    </div>

    <div className="wx-card">
      <div className="wx-head"><span className="wx-title">更新信息</span></div>
      <div className="cd-inforow"><span>最后更新</span><span>{`${latest.time}${latest.collectedAt ? `（采集于 ${hm(latest.collectedAt)}）` : ''}`}</span></div>
      <div className="cd-inforow"><span>数据源时间</span><span>{latest.sourceUpdated ? hm(latest.sourceUpdated) : '–'}</span></div>
      <div className="cd-inforow"><span>下次计划刷新</span><span>{nextSlotLabel(now)}</span></div>
      <div className="cd-inforow"><span>更新周期</span><span>每30分钟（整点 / 半点）</span></div>
    </div>

    <div className="wx-card">
      <div className="wx-head"><span className="wx-title">{`项目排队（${latest.time}）`}</span></div>
      {rides.map((r: any, i: number) => (
        <div className="cd-ride" key={r.id || i}>
          <span className="cd-rname">{rideZh(r.name)}</span>
          {r.open ? <span className="cd-rwait">{`${r.wait != null ? r.wait : '–'} 分钟`}</span> : <span className="cd-rwait closed">关闭</span>}
        </div>
      ))}
      <div className="wx-foot">
        数据来源：Queue-Times.com · <a href="https://queue-times.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>Powered by Queue-Times.com</a>
        {` · 热度 = 全部开放项目排队分钟总和 × ${data.coef || 40} 的算法估算值，非上海迪士尼官方统计。`}
      </div>
    </div>
  </>);
}
