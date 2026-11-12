import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
// @ts-ignore schedule logic is plain ESM with unit tests
import { PEOPLE, POSITIONS, SLOT_OF, SLOTS, dateLabel, buildText, doorLabel, slotAssignments } from './schedule.mjs';
import { EquipmentApp } from './equipment';
import './style.css';

const STORE = 'stage-schedule-v1';
type Doors = Record<string, { z?: boolean; s?: boolean }>;

const I = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11l8-7 8 7" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></svg>,
  folder: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>,
  wrench: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4.2 4.2 0 0 1 5.9-4L17.8 5l1.6 1.6 2.8-2.8a4.2 4.2 0 0 1-5.6 5.3L9 16.7a2.1 2.1 0 1 1-3-3l2.6-2.6a4.2 4.2 0 0 1 6.1-4.8z" /></svg>,
  me: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.6" /><path d="M5 20c1.2-3.2 3.8-4.8 7-4.8s5.8 1.6 7 4.8" /></svg>,
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
  const [sheetPerson, setSheetPerson] = useState<string | null>(null);
  const [selPos, setSelPos] = useState('');
  const [selDoors, setSelDoors] = useState<{ z: boolean; s: boolean }>({ z: false, s: false });
  const [generated, setGenerated] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [toast, setToast] = useState('');
  const [updateReady, setUpdateReady] = useState(false);
  const [flash, setFlash] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify({ dateKey: today.key, assign, doors })); } catch {} }, [assign, doors, today.key]);
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

  const openSheet = (person: string) => {
    setSheetPerson(person);
    setSelPos(assign[person] || '');
    setSelDoors({ z: !!doors[person]?.z, s: !!doors[person]?.s });
  };
  const focusNext = (after: string, next: Record<string, string>) => {
    const idx = PEOPLE.indexOf(after);
    for (let k = 1; k <= PEOPLE.length; k++) {
      const j = (idx + k) % PEOPLE.length;
      if (!next[PEOPLE[j]]) {
        setFlash(j);
        setTimeout(() => document.getElementById(`person-${j}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
        setTimeout(() => setFlash(-1), 1300);
        break;
      }
    }
  };
  const confirmSheet = () => {
    if (!sheetPerson) return;
    const nextAssign = { ...assign };
    if (selPos) nextAssign[sheetPerson] = selPos; else delete nextAssign[sheetPerson];
    const nextDoors = { ...doors };
    if (selDoors.z || selDoors.s) nextDoors[sheetPerson] = { z: selDoors.z, s: selDoors.s }; else delete nextDoors[sheetPerson];
    setAssign(nextAssign); setDoors(nextDoors);
    const person = sheetPerson; setSheetPerson(null);
    notify(selPos ? `${person} → ${selPos}` : `已更新 ${person}`);
    if (selPos) focusNext(person, nextAssign);
  };
  const clearPerson = () => {
    if (!sheetPerson) return;
    const nextAssign = { ...assign }; delete nextAssign[sheetPerson];
    const nextDoors = { ...doors }; delete nextDoors[sheetPerson];
    setAssign(nextAssign); setDoors(nextDoors); setSheetPerson(null);
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
    { id: 'me', label: '我的', icon: I.me },
  ];

  return (
    <>
      {tab === 'home' && <div className="homebg" aria-hidden="true" />}
      <div className={'shell' + (tab === 'home' ? ' hasbg' : ' notoolbar')}>
        {tab === 'home' && (
          <>
            <div className="hero">
              <div className="eyebrow">NTS TEAM</div>
              <h1>舞台工具箱</h1>
              <p>首页就是排班：点人名选岗位，生成文案发微信群。</p>
            </div>
            <div className="datecard">
              <span className="cal">{I.cal}</span>
              <div><div className="dlabel">今日日期</div><div className="dbig">{today.key.replace(/-/g, '.')}</div></div>
              <span className="wd">{today.label.split(' ')[1]}</span>
            </div>
            <div className="statusrow">
              <span id="progress">{`岗位已填 ${filled} / ${SLOTS.length} · 已安排 ${Object.keys(assign).filter(k => assign[k]).length} 人${doorCount ? ` · 大门板 ${doorCount} 人` : ''}`}</span>
              <button id="btn-clear" onClick={clearToday}>清空重选</button>
            </div>
            <div id="warn">{dupPositions.length ? `注意：${dupPositions.join('、')} 被选给了不止一个人` : ''}</div>
            <div className="peoplecard">
              {PEOPLE.map((person, i) => {
                const pos = assign[person];
                const dtag = doorLabel(person, doors).replace(/[（）]/g, '');
                return (
                  <button key={person} id={`person-${i}`} className={'person' + (flash === i ? ' flash' : '')} onClick={() => openSheet(person)}>
                    <span className="idx">{i + 1}</span><span className="pname">{person}</span>
                    {dtag && <span className="doortag">{dtag}</span>}
                    {pos ? <span className={'chip' + (counts[pos] > 1 ? ' dup' : '')}>{pos}</span> : <span className="chip none">未选择</span>}
                    <span className="chev">›</span>
                  </button>
                );
              })}
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

        {tab === 'files' && (
          <>
            <div className="sect-title">工具</div>
            <div className="toolgrid">
              <button className="toolcard c1" onClick={() => setTab('home')}><h3>舞台排班工具</h3><p>人员勾选 / 生成文案 / 复制排班</p><span className="go">›</span></button>
              <button className="toolcard c2" onClick={() => setTab('device')}><h3>设备故障记录</h3><p>花园灯 / 外围灯 / 城堡 · 对讲机速记后誊抄</p><span className="go">›</span></button>
              <button className="toolcard c3 off" disabled><h3>设备图</h3><p>激光点位图 / 城堡特效图 / 花园特效图 / 花园烟机</p><span className="soon">敬请期待</span></button>
              <button className="toolcard c4 off" disabled><h3>特效物料登记表</h3><p>燃料领用 / 库存剩余 / 登记记录</p><span className="soon">敬请期待</span></button>
            </div>
            <p className="me-note">从这里进入对应工具。后两个还没做，你需要的话跟我说，我加上。</p>
          </>
        )}

        {tab === 'device' && (
          <>
            <div className="backbar">
              <button onClick={() => setTab('home')}>‹ 返回首页</button>
              <span>设备故障快速记录 · 记录保存在本机</span>
            </div>
            <div className="equip"><EquipmentApp /></div>
          </>
        )}

        {tab === 'me' && (
          <>
            <div className="sect-title">我的</div>
            <div className="mecard">
              <div className="inforow"><span className="k">今日日期</span><span className="v">{today.label}</span></div>
              <div className="inforow"><span className="k">版本</span><span className="v">舞台工具箱 V1.2.1</span></div>
              <div className="inforow"><span className="k">排班名单</span><span className="v">17 人 · 按班表顺序</span></div>
              <div className="inforow"><span className="k">数据存储</span><span className="v">仅保存在本机浏览器</span></div>
            </div>
            <p className="me-note">排班：当天选好的岗位和大门板会自动保存，刷新不丢，第二天自动清空。设备记录：存在本机，按日期保存，可导出 CSV。两个工具的数据都不上传服务器。</p>
            <button className="me-btn" style={{ borderColor: 'rgba(232,195,122,.5)', color: 'var(--gold)', marginBottom: 10 }} onClick={async () => { try { const r = await navigator.serviceWorker?.getRegistration(); await r?.update(); } catch {} location.reload(); }}>重新加载最新版</button>
            <button className="me-btn" onClick={clearToday}>清空今日排班</button>
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

      {sheetPerson && (
        <div id="sheet" role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget) setSheetPerson(null); }}>
          <div className="sheet-panel">
            <h3 id="sheet-name">{sheetPerson}</h3>
            <p className="sub">先点今天的岗位，再勾大门板（没有就不勾），最后点确定。</p>
            <div id="chips">
              {POSITIONS.map(pos => {
                const taken = PEOPLE.some(p => p !== sheetPerson && assign[p] === pos);
                return (
                  <button key={pos} className={'pos' + (selPos === pos ? ' active' : '') + (taken ? ' taken' : '')} onClick={() => setSelPos(pos)}>
                    {pos + (taken ? '（已有人）' : '')}
                  </button>
                );
              })}
            </div>
            <div className="door-title">大门板（可多选，会写在人名后面）</div>
            <div className="door-row">
              <button className={'door' + (selDoors.z ? ' on' : '')} onClick={() => setSelDoors(d => ({ ...d, z: !d.z }))}>装大门板</button>
              <button className={'door' + (selDoors.s ? ' on' : '')} onClick={() => setSelDoors(d => ({ ...d, s: !d.s }))}>收大门板</button>
            </div>
            <div className="sheet-actions">
              <button id="sheet-clear" onClick={clearPerson}>不安排 / 清除</button>
              <button onClick={() => setSheetPerson(null)}>关闭</button>
              <button className="ok" onClick={confirmSheet}>确定</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div id="toast">{toast}</div>}
      {updateReady && <button className="update-banner" onClick={() => location.reload()}>新版本已准备好 · 点击更新（数据不丢）</button>}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {}); });
