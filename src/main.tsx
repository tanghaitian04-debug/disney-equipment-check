import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
// @ts-ignore schedule logic is plain ESM with unit tests
import { PEOPLE, POSITIONS, SLOT_OF, SLOTS, dateLabel, buildText, doorLabel, slotAssignments } from './schedule.mjs';
import { EquipApp } from './equip2';
import { OverviewApp } from './overview';
import { MineApp } from './mine';
import { WeatherPanel } from './weather';
import { CrowdPanel } from './crowd';
// @ts-ignore plain ESM logic with unit tests
import { loadSession, apiGetShows, apiGetRosterMeta, apiGetRosterPdf } from './cloud.mjs';
import './style.css';
// @ts-ignore hand-maintained weekly show announcements
import { SHOWS } from './showdata.mjs';
// @ts-ignore asset URL for the pdf.js worker used to render the roster preview
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.js?url';

// Render page 1 of a base64 PDF to a JPEG data URL (homepage roster preview).
// pdf.js is loaded lazily so it never weighs on the first paint.
async function renderPdfFirstPage(b64: string): Promise<string> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.js');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(2.5, 1240 / base.width) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally { try { pdf.destroy(); } catch {} }
}

const STORE = 'stage-schedule-v1';
type Doors = Record<string, { z?: boolean; s?: boolean }>;
type Session = { token: string; username: string; name: string; mustChange: boolean };

const I = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.6v2.2" /><path d="M12 2.6l2.8.9-2.8.9" fill="currentColor" stroke="none" /><path d="M9.6 7.6L12 5.2l2.4 2.4" /><path d="M10.1 7.4v5.1h3.8V7.4" /><path d="M4.6 21v-9.4L6.1 9.9l1.5 1.7V21" /><path d="M16.4 21v-9.4l1.5-1.7 1.5 1.7V21" /><path d="M7.6 15h2.5M13.9 15h2.5" /><path d="M10.9 21v-2.5a1.1 1.1 0 0 1 2.2 0V21" /><path d="M4.6 21h14.8" /></svg>,
  castle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.6v2.2" /><path d="M12 2.6l2.8.9-2.8.9" fill="currentColor" stroke="none" /><path d="M9.6 7.6L12 5.2l2.4 2.4" /><path d="M10.1 7.4v5.1h3.8V7.4" /><path d="M4.6 21v-9.4L6.1 9.9l1.5 1.7V21" /><path d="M16.4 21v-9.4l1.5-1.7 1.5 1.7V21" /><path d="M7.6 15h2.5M13.9 15h2.5" /><path d="M10.9 21v-2.5a1.1 1.1 0 0 1 2.2 0V21" /><path d="M4.6 21h14.8" /></svg>,
  folder: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>,
  wind: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9.59 4.59A2 2 0 1 1 11 8H2" /><path d="M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2" /><path d="M12.59 19.41A2 2 0 1 0 14 16H2" /></svg>,
  wrench: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4.2 4.2 0 0 1 5.9-4L17.8 5l1.6 1.6 2.8-2.8a4.2 4.2 0 0 1-5.6 5.3L9 16.7a2.1 2.1 0 1 1-3-3l2.6-2.6a4.2 4.2 0 0 1 6.1-4.8z" /></svg>,
  me: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.6" /><path d="M5 20c1.2-3.2 3.8-4.8 7-4.8s5.8 1.6 7 4.8" /></svg>,
  alert: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.6" /><path d="M12 7.6V13" /><circle cx="12" cy="16.4" r="0.4" fill="currentColor" /></svg>,
  crowd: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8.4" r="3.1" /><path d="M3.4 19.2c.9-2.9 2.9-4.4 5.6-4.4s4.7 1.5 5.6 4.4" /><circle cx="17.2" cy="9.6" r="2.5" /><path d="M16.9 14.9c1.9.3 3.2 1.6 3.9 4.3" /></svg>,
  cal: <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>,
};

function App() {
  const [tab, setTab] = useState('home');
  const [today] = useState(dateLabel);
  const [assign, setAssign] = useState<Record<string, string>>(() => {
    try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (s && s.dateKey === dateLabel().key) return s.assign || {}; } catch {}
    return {};
  });
  const [doors, setDoors] = useState<Doors>(() => {
    try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (s && s.dateKey === dateLabel().key) return s.doors || {}; } catch {}
    return {};
  });
  const [cur, setCur] = useState<number>(() => {
    try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (s && s.dateKey === dateLabel().key && typeof s.idx === 'number') return Math.min(Math.max(s.idx, 0), PEOPLE.length - 1); } catch {}
    return 0;
  });
  const advTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [session, setSession] = useState<Session | null>(() => loadSession(localStorage) as Session | null);
  const [shows, setShowsState] = useState<any[]>(SHOWS);
  const [rosterMeta, setRosterMeta] = useState<any>(null);
  useEffect(() => {
    if (tab !== 'home') return;
    apiGetShows().then((list: any) => { if (Array.isArray(list) && list.length) setShowsState(list); }).catch(() => {});
    apiGetRosterMeta().then((m: any) => setRosterMeta(m)).catch(() => {});
  }, [tab]);
  const [rosterPreview, setRosterPreview] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  useEffect(() => {
    if (!rosterMeta || !rosterMeta.hasPdf) { setRosterPreview(null); return; }
    let dead = false;
    (async () => {
      try {
        const cached = JSON.parse(localStorage.getItem('toolbox-roster-preview-v1') || 'null');
        if (cached && cached.updatedAt === rosterMeta.updatedAt && typeof cached.img === 'string' && cached.img) { setRosterPreview(cached.img); return; }
      } catch {}
      setPreviewBusy(true);
      try {
        const b64 = await apiGetRosterPdf();
        if (!b64 || dead) return;
        const img = await renderPdfFirstPage(b64);
        if (dead) return;
        setRosterPreview(img);
        try { localStorage.setItem('toolbox-roster-preview-v1', JSON.stringify({ updatedAt: rosterMeta.updatedAt, img })); } catch {}
      } catch { /* fall back to the text row */ }
      if (!dead) setPreviewBusy(false);
    })();
    return () => { dead = true; };
  }, [rosterMeta && rosterMeta.updatedAt]);
  const openCloudPdf = async () => {
    const b64 = await apiGetRosterPdf();
    if (!b64) { window.alert('PDF 加载失败，请稍后再试'); return; }
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    window.open(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), '_blank');
  };
  const [generated, setGenerated] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [toast, setToast] = useState('');
  const [updateReady, setUpdateReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify({ dateKey: today.key, assign, doors, idx: cur })); } catch {} }, [assign, doors, cur, today.key]);
  useEffect(() => {
    // Auto-apply updates: when a new service worker takes over and this page was
    // already controlled by an older one, reload once so the user never has to
    // hunt for an update button. The banner remains as a fallback.
    const hadController = !!navigator.serviceWorker?.controller;
    let reloaded = false;
    const changed = () => {
      if (hadController && !reloaded && !sessionStorage.getItem('sw-auto-reloaded')) {
        reloaded = true;
        try { sessionStorage.setItem('sw-auto-reloaded', '1'); } catch {}
        location.reload();
        return;
      }
      setUpdateReady(true);
    };
    navigator.serviceWorker?.addEventListener('controllerchange', changed);
    return () => navigator.serviceWorker?.removeEventListener('controllerchange', changed);
  }, []);
  useEffect(() => { const t = setTimeout(() => { try { sessionStorage.removeItem('sw-auto-reloaded'); } catch {} }, 4000); return () => clearTimeout(t); }, []);
  useEffect(() => {
    let lock: any = null;
    const request = async () => { try { if (!lock || lock.released) lock = await (navigator as any).wakeLock?.request('screen'); } catch {} };
    const onVis = () => { if (document.visibilityState === 'visible') request(); };
    document.addEventListener('pointerdown', request);
    document.addEventListener('visibilitychange', onVis);
    request();
    return () => { document.removeEventListener('pointerdown', request); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const notify = (msg: string) => { setToast(msg); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setToast(''), 2000); };
  const counts: Record<string, number> = {};
  for (const p of PEOPLE) if (assign[p]) counts[assign[p]] = (counts[assign[p]] || 0) + 1;
  const by = slotAssignments(assign, doors) as Record<string, string[]>;
  const filled = SLOTS.filter(s => by[s].length).length;
  const dupPositions = POSITIONS.filter(pos => (counts[pos] || 0) > 1);
  const missing = SLOTS.filter(s => !by[s].length);
  const doorCount = PEOPLE.filter(p => doors[p] && (doors[p].z || doors[p].s)).length;

  const person = PEOPLE[cur];
  const occupantOf = (pos: string) => PEOPLE.find(p => assign[p] === pos);
  const nextFree = (from: number, next: Record<string, string>) => {
    for (let k = 1; k <= PEOPLE.length; k++) {
      const j = (from + k) % PEOPLE.length;
      if (!next[PEOPLE[j]]) return j;
    }
    return -1;
  };
  const pickPos = (pos: string) => {
    const p = PEOPLE[cur];
    const nextAssign = { ...assign };
    if (nextAssign[p] === pos) { delete nextAssign[p]; setAssign(nextAssign); return; }
    nextAssign[p] = pos; setAssign(nextAssign);
    navigator.vibrate?.(8);
    if (advTimer.current) clearTimeout(advTimer.current);
    advTimer.current = setTimeout(() => {
      const j = nextFree(cur, nextAssign);
      if (j >= 0) setCur(j); else if (cur < PEOPLE.length - 1) setCur(cur + 1);
    }, 260);
  };
  const toggleDoor = (kind: 'z' | 's') => {
    const p = PEOPLE[cur];
    const d = { ...(doors[p] || {}) };
    if (kind === 'z') d.z = !d.z; else d.s = !d.s;
    const nextDoors = { ...doors };
    if (d.z || d.s) nextDoors[p] = { z: !!d.z, s: !!d.s }; else delete nextDoors[p];
    setDoors(nextDoors);
  };
  const clearCur = () => {
    const p = PEOPLE[cur];
    if (!assign[p] && !doors[p]) return;
    const nextAssign = { ...assign }; delete nextAssign[p];
    const nextDoors = { ...doors }; delete nextDoors[p];
    setAssign(nextAssign); setDoors(nextDoors); notify(`已清除 ${p}`);
  };
  const doGenerate = (scroll = true) => {
    setGenerated(buildText(today.label, assign, doors));
    setShowPreview(true);
    if (scroll) setTimeout(() => document.getElementById('preview-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const doCopy = async () => {
    const text = buildText(today.label, assign, doors);
    setGenerated(text); setShowPreview(true);
    try { await navigator.clipboard.writeText(text); notify('已复制，去微信群粘贴发送就行'); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove();
      notify(ok ? '已复制，去微信群粘贴发送就行' : '复制失败，请长按文案手动复制');
    }
  };
  const clearToday = () => { if ((Object.keys(assign).length || doorCount) && confirm('清空今天已选的全部岗位和大门板？')) { setAssign({}); setDoors({}); setShowPreview(false); notify('已清空'); } };
  const copyText = async (text: string, okMsg: string) => {
    try { await navigator.clipboard.writeText(text); notify(okMsg); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove();
      notify(ok ? okMsg : '复制失败，请长按手动复制');
    }
  };

  const tabs = [
    { id: 'home', label: '首页', icon: I.home },
    { id: 'wind', label: '风速', icon: I.wind },
    { id: 'device', label: '设备', icon: I.wrench },
    { id: 'overview', label: '故障全览', icon: I.alert },
    { id: 'crowd', label: '客流', icon: I.crowd },
    { id: 'mine', label: '我的', icon: I.me },
  ];

  return (
    <>
      {tab === 'home' && <div className="homebg" aria-hidden="true" />}
      <div id="shell" className={'shell tab-' + tab + (tab === 'home' ? ' hasbg' : ' notoolbar')}>
        {tab === 'home' && (
          <>
            <div className="datecard">
              <span className="cal">{I.cal}</span>
              <div><div className="dlabel">今日日期</div><div className="dbig">{today.key.replace(/-/g, '.')}</div></div>
              <span className="wd">{today.label.split(' ')[1]}</span>
            </div>
            <div className="showbox">
              <span className="showbox-tag">演出场次</span>
              {shows.map((sh: any) => {
                const a = sh.date.split('-').map(Number);
                return (
                  <div key={sh.date} className={'showline' + (sh.date === today.key ? ' today' : '')}>
                    <span className="showline-date">{`${a[1]}月${a[2]}日`}</span>
                    <span className="showline-txt">{sh.text}</span>
                    {sh.date === today.key && <span className="mypost-today">今天</span>}
                  </div>
                );
              })}
            </div>
            {rosterMeta && rosterMeta.hasPdf ? (
              <button type="button" className="rostercard" onClick={openCloudPdf}>
                <span className="rc-head"><span className="rc-title">本周班表</span><span className="rc-range">{rosterMeta.label || ''}</span><span className="rc-open">打开完整 PDF ›</span></span>
                {rosterPreview ? (
                  <span className="rc-imgwrap"><img src={rosterPreview} alt="本周班表预览" /></span>
                ) : (
                  <span className="rc-hint">{previewBusy ? '正在生成班表预览…' : `经理 ${rosterMeta.updatedBy || ''} 上传 · 点开可看完整班表（PDF）`}</span>
                )}
              </button>
            ) : (
              <a className="rostercard" href="/files/roster-1115-1121.pdf" target="_blank" rel="noreferrer">
                <span className="rc-head"><span className="rc-title">本周班表</span><span className="rc-range">11月15日 – 11月21日</span><span className="rc-open">打开完整 PDF ›</span></span>
                <span className="rc-imgwrap"><img src="/files/roster-1115-1121.jpg" alt="11月15日至11月21日班表预览" loading="lazy" /></span>
                <span className="rc-hint">点开可看完整班表（PDF）</span>
              </a>
            )}
            <div className="statusrow">
              <span id="progress">{`岗位已填 ${filled} / ${SLOTS.length} · 已安排 ${Object.keys(assign).filter(k => assign[k]).length} 人${doorCount ? ` · 大门板 ${doorCount} 人` : ''}`}</span>
              <button id="btn-clear" onClick={clearToday}>清空重选</button>
            </div>
            <div id="warn">{dupPositions.length ? `注意：${dupPositions.join('、')} 被选给了不止一个人` : ''}</div>
            <div className="personcard" key={person}>
              <div className="pc-head">
                <span className="pc-bar" />
                <span className="pc-name">{person}</span>
                <span className="pc-prog">{`第 ${cur + 1} / ${PEOPLE.length} 人`}</span>
                {assign[person] ? <span className="pc-chip">{assign[person]}</span> : <span className="pc-chip none">未选择</span>}
              </div>
              <div className="posgrid">
                {POSITIONS.map(pos => {
                  const occ = occupantOf(pos);
                  const mine = assign[person] === pos;
                  return (
                    <button key={pos} className={'postile' + (mine ? ' on' : '')} onClick={() => pickPos(pos)}>
                      <span className={'cbox' + (mine ? ' on' : '')}>{mine ? '✓' : ''}</span>
                      <span className="plabel">{pos}</span>
                      {occ && !mine && <span className="occ">{occ}</span>}
                    </button>
                  );
                })}
              </div>
              <div className="doorline">
                <span className="door-cap">大门板</span>
                <button className={'doortile' + (doors[person]?.z ? ' on' : '')} onClick={() => toggleDoor('z')}><span className={'cbox' + (doors[person]?.z ? ' on' : '')}>{doors[person]?.z ? '✓' : ''}</span>装大门板</button>
                <button className={'doortile' + (doors[person]?.s ? ' on' : '')} onClick={() => toggleDoor('s')}><span className={'cbox' + (doors[person]?.s ? ' on' : '')}>{doors[person]?.s ? '✓' : ''}</span>收大门板</button>
              </div>
              <div className="navrow">
                <button disabled={cur === 0} onClick={() => setCur(cur - 1)}>‹ 上一人</button>
                <button className="clr" onClick={clearCur}>清除此人</button>
                <button disabled={cur === PEOPLE.length - 1} onClick={() => setCur(cur + 1)}>下一人 ›</button>
              </div>
            </div>
            <div className="jumpstrip">
              {PEOPLE.map((p, i) => (
                <button key={p} className={'jchip' + (i === cur ? ' cur' : '') + (assign[p] ? ' done' : '')} onClick={() => setCur(i)}>{p}{assign[p] ? ' ✓' : ''}</button>
              ))}
            </div>
            {showPreview && (
              <section id="preview-wrap">
                <h2>生成文案</h2>
                <div id="miss">{missing.length ? `还没选人的岗位：${missing.join('、')}（生成文案里会先空着）` : '11 个岗位都已填好，可以复制发送。'}</div>
                <pre id="preview">{generated}</pre>
              </section>
            )}
            <div className="actionbar">
              <button id="btn-generate" onClick={() => { doGenerate(); navigator.vibrate?.(10); }}>生成文案</button>
              <button id="btn-copy" onClick={doCopy}>复制</button>
            </div>
          </>
        )}

        {tab === 'wind' && (
          <>
            <div className="sect-title">风速</div>
            <a className="wind-open" href="http://123.60.26.100:4050/disneywind/" target="_blank" rel="noreferrer">
              <span className="wind-open-ic">{I.wind}</span>
              <span className="wind-open-main">
                <span className="wind-open-title">打开风速平台</span>
                <span className="wind-open-url">123.60.26.100:4050/disneywind</span>
              </span>
              <span className="wind-open-arrow">›</span>
            </a>
            <div className="wind-cred">
              <button type="button" className="wind-cred-row" onClick={() => copyText('abc', '账户已复制')}>
                <span className="wind-cred-cap">账户</span>
                <span className="wind-cred-val">abc</span>
                <span className="wind-cred-copy">点按复制</span>
              </button>
              <button type="button" className="wind-cred-row" onClick={() => copyText('123', '密码已复制')}>
                <span className="wind-cred-cap">密码</span>
                <span className="wind-cred-val">123</span>
                <span className="wind-cred-copy">点按复制</span>
              </button>
            </div>
            <p className="wind-note">点上面的框跳转到风速平台，再用下面的账户、密码登录（点任意一行就能复制）。</p>
            <WeatherPanel />
          </>
        )}

        {tab === 'device' && (
          <>
            <div className="backbar">
              <button onClick={() => setTab('home')}>‹ 返回首页</button>
              <span>{session ? '设备故障记录 · 云端实时同步' : '设备故障记录'}</span>
            </div>
            {session ? <EquipApp session={session} /> : (
              <div className="gatecard">
                <h3>登录后使用团队设备记录</h3>
                <p>设备故障现在全班共享：你记的故障，同事打开就能看到；同事记的，你也能看到。用你自己的账号登录一次就行（30 天内免登录）。</p>
                <button onClick={() => setTab('mine')}>去登录</button>
              </div>
            )}
          </>
        )}

        {tab === 'overview' && (session ? <OverviewApp session={session} /> : (
          <div className="gatecard">
            <h3>登录后查看故障全览</h3>
            <p>全览里是全班共享的故障记录，登录后就能看，还能一键复制报告。</p>
            <button onClick={() => setTab('mine')}>去登录</button>
          </div>
        ))}

        {tab === 'crowd' && (
          <>
            <div className="sect-title">乐园客流</div>
            <CrowdPanel />
          </>
        )}

        {tab === 'mine' && (
          <>
            <div className="sect-title">我的</div>
            <MineApp session={session} onSession={setSession} notify={notify} />
          </>
        )}
      </div>

      <div className="bottomstack">
        <nav className="tabbar-main">
          {tabs.map(t => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => { setTab(t.id); document.getElementById('shell')?.scrollTo(0, 0); }}>{t.icon}<span>{t.label}</span></button>
          ))}
        </nav>
      </div>

      {toast && <div id="toast">{toast}</div>}
      {updateReady && <button className="update-banner" onClick={() => location.reload()}>新版本已准备好 · 点击更新（数据不丢）</button>}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {}); });
