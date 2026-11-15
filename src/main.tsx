import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
// @ts-ignore schedule logic is plain ESM with unit tests
import { PEOPLE, POSITIONS, SLOT_OF, SLOTS, dateLabel, buildText, doorLabel, slotAssignments } from './schedule.mjs';
import { EquipApp } from './equip2';
import { OverviewApp } from './overview';
import { MineApp } from './mine';
// @ts-ignore plain ESM logic with unit tests
import { loadSession } from './cloud.mjs';
import './style.css';

const STORE = 'stage-schedule-v1';
type Doors = Record<string, { z?: boolean; s?: boolean }>;
type Session = { token: string; username: string; name: string; mustChange: boolean };
const MAPS = [
  { src: '/maps/map-laser.jpg', title: '激光点位总图' },
  { src: '/maps/map-castle-dmx.jpg', title: '城堡正面点位' },
  { src: '/maps/map-castle-elev.jpg', title: '城堡立面点位' },
  { src: '/maps/map-wheel.jpg', title: '城堡 Wheel 位置' },
  { src: '/maps/map-garden-af.jpg', title: '花园灯位图' },
  { src: '/maps/map-garden-plan.jpg', title: '花园平面点位' },
];

const I = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.6v2.2" /><path d="M12 2.6l2.8.9-2.8.9" fill="currentColor" stroke="none" /><path d="M9.6 7.6L12 5.2l2.4 2.4" /><path d="M10.1 7.4v5.1h3.8V7.4" /><path d="M4.6 21v-9.4L6.1 9.9l1.5 1.7V21" /><path d="M16.4 21v-9.4l1.5-1.7 1.5 1.7V21" /><path d="M7.6 15h2.5M13.9 15h2.5" /><path d="M10.9 21v-2.5a1.1 1.1 0 0 1 2.2 0V21" /><path d="M4.6 21h14.8" /></svg>,
  castle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.6v2.2" /><path d="M12 2.6l2.8.9-2.8.9" fill="currentColor" stroke="none" /><path d="M9.6 7.6L12 5.2l2.4 2.4" /><path d="M10.1 7.4v5.1h3.8V7.4" /><path d="M4.6 21v-9.4L6.1 9.9l1.5 1.7V21" /><path d="M16.4 21v-9.4l1.5-1.7 1.5 1.7V21" /><path d="M7.6 15h2.5M13.9 15h2.5" /><path d="M10.9 21v-2.5a1.1 1.1 0 0 1 2.2 0V21" /><path d="M4.6 21h14.8" /></svg>,
  folder: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>,
  wrench: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4.2 4.2 0 0 1 5.9-4L17.8 5l1.6 1.6 2.8-2.8a4.2 4.2 0 0 1-5.6 5.3L9 16.7a2.1 2.1 0 1 1-3-3l2.6-2.6a4.2 4.2 0 0 1 6.1-4.8z" /></svg>,
  me: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.6" /><path d="M5 20c1.2-3.2 3.8-4.8 7-4.8s5.8 1.6 7 4.8" /></svg>,
  alert: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.6" /><path d="M12 7.6V13" /><circle cx="12" cy="16.4" r="0.4" fill="currentColor" /></svg>,
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
  const [filesView, setFilesView] = useState<'root' | 'maps'>('root');
  const [mapOpen, setMapOpen] = useState<number | null>(null);
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

  const tabs = [
    { id: 'home', label: '首页', icon: I.home },
    { id: 'files', label: '文件', icon: I.folder },
    { id: 'device', label: '设备', icon: I.wrench },
    { id: 'overview', label: '故障全览', icon: I.alert },
    { id: 'mine', label: '我的', icon: I.me },
  ];

  return (
    <>
      {tab === 'home' && <div className="homebg" aria-hidden="true" />}
      <div className={'shell' + (tab === 'home' ? ' hasbg' : ' notoolbar')}>
        {tab === 'home' && (
          <>
            <div className="hero">
              <div className="eyebrow"><span className="hero-castle">{I.castle}</span>NTS TEAM</div>
              <h1>舞台工具箱</h1>
            </div>
            <div className="datecard">
              <span className="cal">{I.cal}</span>
              <div><div className="dlabel">今日日期</div><div className="dbig">{today.key.replace(/-/g, '.')}</div></div>
              <span className="wd">{today.label.split(' ')[1]}</span>
            </div>
            <a className="rostercard" href="/files/roster-1115-1121.pdf" target="_blank" rel="noreferrer">
              <span className="rc-head"><span className="rc-title">本周班表</span><span className="rc-range">11月15日 – 11月21日</span><span className="rc-open">打开完整 PDF ›</span></span>
              <span className="rc-imgwrap"><img src="/files/roster-1115-1121.jpg" alt="11月15日至11月21日班表预览" loading="lazy" /></span>
              <span className="rc-hint">点开可看完整班表（PDF）</span>
            </a>
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
          </>
        )}

        {tab === 'files' && filesView === 'root' && (
          <>
            <div className="sect-title">文件</div>
            <button className="mapentry" onClick={() => setFilesView('maps')}>
              <span className="mapentry-txt"><h3>设备图</h3></span>
              <span className="go">›</span>
            </button>
          </>
        )}

        {tab === 'files' && filesView === 'maps' && (
          <>
            <div className="backbar">
              <button onClick={() => setFilesView('root')}>‹ 返回</button>
              <span>设备图 · 点任意一张看大图</span>
            </div>
            <div className="mapgrid">
              {MAPS.map((m, i) => (
                <button key={m.src} className="mapcard" onClick={() => setMapOpen(i)}>
                  <span className="mapthumb"><img src={m.src} alt={m.title} loading="lazy" /></span>
                  <span className="maptitle">{m.title}</span>
                </button>
              ))}
            </div>
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

        {tab === 'mine' && (
          <>
            <div className="sect-title">我的</div>
            <MineApp session={session} onSession={setSession} notify={notify} />
          </>
        )}
      </div>

      {tab === 'home' && (
        <div className="actionbar">
          <button id="btn-generate" onClick={() => { doGenerate(); navigator.vibrate?.(10); }}>生成文案</button>
          <button id="btn-copy" onClick={doCopy}>复制</button>
        </div>
      )}

      <nav className="tabbar-main">
        {tabs.map(t => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => { setTab(t.id); window.scrollTo(0, 0); }}>{t.icon}<span>{t.label}</span></button>
        ))}
      </nav>

      {mapOpen !== null && (
        <div className="mapviewer" onClick={() => setMapOpen(null)}>
          <div className="mv-bar"><span>{MAPS[mapOpen].title}</span><button onClick={() => setMapOpen(null)}>关闭 ✕</button></div>
          <div className="mv-scroll"><img src={MAPS[mapOpen].src} alt={MAPS[mapOpen].title} /></div>
          <div className="mv-hint">双指捏合可以放大看细节</div>
        </div>
      )}
      {toast && <div id="toast">{toast}</div>}
      {updateReady && <button className="update-banner" onClick={() => location.reload()}>新版本已准备好 · 点击更新（数据不丢）</button>}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {}); });
