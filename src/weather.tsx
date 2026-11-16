import React, { useState, useEffect, useCallback } from 'react';
// @ts-ignore plain ESM logic with unit tests
import { apiGetWeather } from './cloud.mjs';
// @ts-ignore pure weather helpers with unit tests
import { analyzeRain, alertColor, dayLabel, dayText, aqiColor } from './wxlogic.mjs';

// Wind-page weather modules: QWeather minutely rain + official alerts, proxied
// by the cloud function (credentials never reach the client). Data refreshes
// every 5 minutes and on demand. States are kept strictly distinct: a failed
// fetch shows 暂不可用, never "no rain / no warnings".

function pad(n: number) { return String(n).padStart(2, '0'); }
function hm(iso: any): string { const d = new Date(iso); return isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function mdhm(iso: any): string { const d = new Date(iso); return isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`; }

function Card({ title, busy, onRefresh, children }: any) {
  return (
    <div className="wx-card">
      <div className="wx-head">
        <span className="wx-title">{title}</span>
        <button type="button" className="wx-refresh" disabled={busy} onClick={onRefresh}>{busy ? '刷新中…' : '刷新'}</button>
      </div>
      {children}
    </div>
  );
}

function RainCard({ sec, busy, onRefresh, netFail }: any) {
  let body: any = null;
  if (!sec) {
    body = <div className="wx-big">{netFail ? '降雨数据暂不可用' : '正在获取降雨数据…'}</div>;
  } else if (sec.status === 'not_configured') {
    body = (<>
      <div className="wx-big">天气服务尚未配置</div>
      <div className="wx-note2">管理员完成和风天气配置后，这里会自动显示未来2小时降雨。</div>
    </>);
  } else if (sec.status === 'error') {
    body = <div className="wx-big">降雨数据暂不可用</div>;
  } else {
    const a = analyzeRain(sec.points, Date.now());
    if (!a) {
      body = <div className="wx-big">降雨数据暂不可用</div>;
    } else if (!a.hasRain) {
      body = (<>
        <div className="wx-big">未来2小时暂无明显降雨</div>
        {sec.summary ? <div className="wx-sub">{sec.summary}</div> : null}
        <RainBars points={sec.points} maxP={0} />
        <RainFoot sec={sec} />
      </>);
    } else {
      const headline = a.rainingNow ? `正在下${a.kind}` : `约 ${a.startInMin} 分钟后开始下${a.kind}`;
      const meta = [`预计强度：${a.band}${a.kind}`, a.endTime ? `预计 ${hm(a.endTime)} 前后停` : '预计2小时内持续'].join(' · ');
      body = (<>
        <div className="wx-big">{headline}</div>
        {sec.summary ? <div className="wx-sub">{sec.summary}</div> : null}
        <div className="wx-meta">{meta}</div>
        <RainBars points={sec.points} maxP={a.maxP} />
        <RainFoot sec={sec} />
      </>);
    }
  }
  return <Card title="未来2小时降雨" busy={busy} onRefresh={onRefresh}>{body}</Card>;
}

function RainBars({ points, maxP }: any) {
  const list = Array.isArray(points) ? points : [];
  if (!list.length) return null;
  return (<>
    <div className="wx-bars">
      {list.map((pt: any, i: number) => {
        const p = Number(pt && pt.p) || 0;
        const h = p > 0 && maxP > 0 ? 16 + (p / maxP) * 84 : 4;
        return <span key={i} className={'wx-bar' + (p > 0 ? '' : ' dry')} style={{ height: `${h}%` }} />;
      })}
    </div>
    <div className="wx-axis"><span>现在</span><span>+1小时</span><span>+2小时</span></div>
  </>);
}

function RainFoot({ sec }: any) {
  const t = sec.updateTime ? hm(sec.updateTime) : '';
  return <div className="wx-foot">{`数据来源：和风天气（QWeather）${t ? ` · 更新于 ${t}` : ''}${sec.status === 'stale' ? ' · 数据可能已过期' : ''}`}</div>;
}

function AlertItem({ a }: any) {
  const [open, setOpen] = useState(false);
  const c = alertColor(a.colorCode);
  const chipText = c.label ? `${c.label}预警` : '预警';
  const title = a.headline || `${a.eventName || '气象'}${chipText}`;
  const meta = [a.sender || '', a.issued ? `发布于 ${mdhm(a.issued)}` : ''].filter(Boolean).join(' · ');
  const times = [a.effective ? `生效 ${mdhm(a.effective)}` : '', a.expire ? `失效 ${mdhm(a.expire)}` : ''].filter(Boolean).join(' · ');
  return (
    <div className="wx-alert">
      <button type="button" className="wx-alert-head" onClick={() => setOpen(!open)}>
        <span className="wx-chip" style={{ background: c.hex }}>{chipText}</span>
        <span className="wx-alert-main">
          <span className="wx-alert-title">{title}</span>
          {meta ? <span className="wx-alert-meta">{meta}</span> : null}
        </span>
        <span className="wx-alert-arrow">{open ? '⌄' : '›'}</span>
      </button>
      {open && (
        <div className="wx-alert-body">
          {a.description ? <div>{a.description}</div> : null}
          {a.instruction ? (<><div className="wx-alert-sec">防御指南</div><div>{a.instruction}</div></>) : null}
          {a.criteria ? (<><div className="wx-alert-sec">预警标准</div><div>{a.criteria}</div></>) : null}
          {times ? <div className="wx-alert-meta" style={{ marginTop: 10 }}>{times}</div> : null}
        </div>
      )}
    </div>
  );
}

function AlertsCard({ sec, busy, onRefresh, netFail }: any) {
  let body: any = null;
  if (!sec) {
    body = <div className="wx-big">{netFail ? '预警数据暂不可用' : '正在获取预警信息…'}</div>;
  } else if (sec.status === 'not_configured') {
    body = (<>
      <div className="wx-big">天气服务尚未配置</div>
      <div className="wx-note2">管理员完成和风天气配置后，这里会自动显示官方气象预警。</div>
    </>);
  } else if (sec.status === 'error') {
    body = <div className="wx-big">预警数据暂不可用</div>;
  } else {
    const list = Array.isArray(sec.list) ? sec.list : [];
    const attrs = Array.isArray(sec.attributions) ? sec.attributions.filter(Boolean) : [];
    body = (<>
      {list.length === 0
        ? <div className="wx-big">当前无生效气象预警</div>
        : list.map((a: any, i: number) => <AlertItem key={a.id || i} a={a} />)}
      <div className="wx-foot">{`${attrs.length ? attrs.join(' ') : '数据来源：和风天气（QWeather）'}${sec.status === 'stale' ? ' · 数据可能已过期' : ''}`}</div>
    </>);
  }
  return <Card title="官方气象预警" busy={busy} onRefresh={onRefresh}>{body}</Card>;
}

function ForecastCard({ sec, busy, onRefresh, netFail }: any) {
  let body: any = null;
  if (!sec) {
    body = <div className="wx-big">{netFail ? '天气预报暂不可用' : '正在获取天气预报…'}</div>;
  } else if (sec.status === 'not_configured') {
    body = (<>
      <div className="wx-big">天气服务尚未配置</div>
      <div className="wx-note2">管理员完成和风天气配置后，这里会自动显示天气预报。</div>
    </>);
  } else if (sec.status === 'error' || !Array.isArray(sec.days) || !sec.days.length) {
    body = <div className="wx-big">天气预报暂不可用</div>;
  } else {
    const now = Date.now();
    const first = sec.days[0];
    const rest = sec.days.slice(1);
    const fl = dayLabel(first.date, now);
    const meta = [
      first.tMin != null && first.tMax != null ? `${first.tMin}° ~ ${first.tMax}°` : '',
      first.precip > 0 ? `降水 ${first.precip}mm` : '无降水',
      first.windDir ? `${first.windDir}${first.windScale ? ` ${first.windScale}级` : ''}` : '',
      first.humidity != null ? `湿度 ${first.humidity}%` : '',
    ].filter(Boolean).join(' · ');
    body = (<>
      <div className="wx-big">{`${fl.rel || fl.md} ${dayText(first)}`.trim()}</div>
      {meta ? <div className="wx-meta">{meta}</div> : null}
      {rest.map((d: any, i: number) => {
        const l = dayLabel(d.date, now);
        return (
          <div className="wx-frow" key={d.date || i}>
            <span className="wx-fdate">{l.md} {l.wd}</span>
            <span className="wx-ftext">{dayText(d)}{d.precip > 0 ? ` · 降水 ${d.precip}mm` : ''}</span>
            <span className="wx-ftemp">{d.tMin != null && d.tMax != null ? `${d.tMin}°~${d.tMax}°` : ''}</span>
          </div>
        );
      })}
      <div className="wx-foot">{`数据来源：和风天气（QWeather）${sec.updateTime ? ` · 更新于 ${hm(sec.updateTime)}` : ''}${sec.status === 'stale' ? ' · 数据可能已过期' : ''}`}</div>
    </>);
  }
  return <Card title="天气预报" busy={busy} onRefresh={onRefresh}>{body}</Card>;
}

function AirCard({ sec, busy, onRefresh, netFail }: any) {
  let body: any = null;
  if (!sec) {
    body = <div className="wx-big">{netFail ? '空气质量暂不可用' : '正在获取空气质量…'}</div>;
  } else if (sec.status === 'not_configured') {
    body = (<>
      <div className="wx-big">天气服务尚未配置</div>
      <div className="wx-note2">管理员完成和风天气配置后，这里会自动显示空气质量。</div>
    </>);
  } else if (sec.status === 'error' || (sec.aqi == null && !sec.aqiDisplay)) {
    body = <div className="wx-big">空气质量暂不可用</div>;
  } else {
    const meta = [
      sec.primaryName ? `首要污染物：${sec.primaryFull || sec.primaryName}` : '',
      sec.pm2p5 != null ? `PM2.5 ${sec.pm2p5} μg/m³` : '',
      sec.pm10 != null ? `PM10 ${sec.pm10} μg/m³` : '',
    ].filter(Boolean).join(' · ');
    const attrs = Array.isArray(sec.attributions) ? sec.attributions.filter(Boolean) : [];
    body = (<>
      <div className="wx-aqirow">
        <span className="wx-aqi">{sec.aqiDisplay || sec.aqi}</span>
        {sec.category ? <span className="wx-chip" style={{ background: aqiColor(sec.level, sec.colorHex) }}>{sec.category}</span> : null}
      </div>
      {meta ? <div className="wx-meta">{meta}</div> : null}
      {sec.advice ? <div className="wx-sub">{sec.advice}</div> : null}
      <div className="wx-foot">{`${attrs.length ? attrs.join(' ') : '数据来源：和风天气（QWeather）'}${sec.status === 'stale' ? ' · 数据可能已过期' : ''}`}</div>
    </>);
  }
  return <Card title="空气质量" busy={busy} onRefresh={onRefresh}>{body}</Card>;
}

export function WeatherPanel() {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [netFail, setNetFail] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    const r = await apiGetWeather();
    if (r) { setData(r); setNetFail(false); } else { setNetFail(true); }
    setBusy(false);
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);
  return (<>
    <RainCard sec={data ? data.rain : null} busy={busy} onRefresh={load} netFail={netFail && !data} />
    <AlertsCard sec={data ? data.alerts : null} busy={busy} onRefresh={load} netFail={netFail && !data} />
    <ForecastCard sec={data ? data.forecast : null} busy={busy} onRefresh={load} netFail={netFail && !data} />
    <AirCard sec={data ? data.air : null} busy={busy} onRefresh={load} netFail={netFail && !data} />
  </>);
}
