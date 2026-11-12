import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
// @ts-ignore model is plain ESM with the tested business rules
import { KEY, regions, dayKey, addRecord, csv, readRecords, roofs, outerMarked, toggleOuter, recordText, isOuter } from './model.mjs';
import './style.css';

type Row = { id: string; code: string; region: string; day: string; time: string; fault?: string; roof?: string; area?: string };

function App() {
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Row[]>(() => {
    try { return readRecords(localStorage); } catch (e) { queueMicrotask(() => setError(String(e))); return []; }
  });
  const [today, setToday] = useState(dayKey());
  const [selected, setSelected] = useState(dayKey());
  // UI position (page + tower) is remembered separately from records, so switching
  // tabs, a refresh, or reopening the app lands exactly where the operator left off.
  const uiInit = (() => { try { return JSON.parse(localStorage.getItem('equipment-check-ui-v1') || '{}'); } catch { return {}; } })();
  const [page, setPage] = useState<string>(['home', 'garden', 'outer', 'castle'].includes(uiInit.page) ? uiInit.page : 'home');
  const [tower, setTower] = useState<number | null>(Number.isInteger(uiInit.tower) && uiInit.tower >= 1 && uiInit.tower <= 9 ? uiInit.tower : null);
  const [uncontrolled, setUncontrolled] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [toast, setToast] = useState('');
  const [confirm, setConfirm] = useState(false);
  // Generic undo: snapshots of rows before each mutation in this session (spec 2.1 撤销上一项操作)
  const [history, setHistory] = useState<Row[][]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowsRef = useRef(rows); rowsRef.current = rows;

  useEffect(() => { try { localStorage.setItem('equipment-check-ui-v1', JSON.stringify({ page, tower })); } catch {} }, [page, tower]);

  // Keep the screen awake while the app is open (testing sessions are long);
  // silently no-op where the Wake Lock API is unavailable.
  useEffect(() => {
    let lock: any = null;
    const request = async () => { try { if (!lock || lock.released) lock = await (navigator as any).wakeLock?.request('screen'); } catch {} };
    const onVis = () => { if (document.visibilityState === 'visible') request(); };
    document.addEventListener('pointerdown', request);
    document.addEventListener('visibilitychange', onVis);
    request();
    return () => { document.removeEventListener('pointerdown', request); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  useEffect(() => {
    const changed = () => setUpdateReady(true);
    navigator.serviceWorker?.addEventListener('controllerchange', changed);
    return () => navigator.serviceWorker?.removeEventListener('controllerchange', changed);
  }, []);

  const notify = (s: string) => {
    setToast(s);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''), 2200);
  };

  useEffect(() => {
    const tick = () => {
      const d = dayKey();
      setToday(old => { if (old !== d) setSelected(s => (s === old ? d : s)); return d; });
    };
    const i = setInterval(tick, 1000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(i); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); };
  }, []);

  const persist = (next: Row[]) => {
    try { localStorage.setItem(KEY, JSON.stringify(next)); rowsRef.current = next; setRows(next); return true; }
    catch { setError('无法保存：浏览器存储不可用或已满。请导出记录备份后重试。'); return false; }
  };
  // Every mutation goes through here so undo always restores the exact previous state.
  const mutate = (next: Row[]) => {
    const prev = rowsRef.current;
    if (persist(next)) { setHistory(h => [prev, ...h].slice(0, 30)); return true; }
    return false;
  };
  const undoLast = () => {
    const [prev, ...rest] = history;
    if (!prev) return;
    if (persist(prev)) { setHistory(rest); notify('已撤销上一项操作'); }
  };
  const canUndo = history.length > 0;

  // Garden: spec 4.4 + 4.5 — record, reset fault to 不亮 ONLY, STAY on the same tower for continuous recording.
  const add = (lamp: number) => {
    if (tower === null || error) return;
    const next = addRecord(rowsRef.current, tower, lamp, new Date(), uncontrolled ? '不受控' : '不亮');
    if (mutate(next)) {
      setToday(dayKey()); setSelected(dayKey());
      setUncontrolled(false); // auto-reset fault; tower intentionally NOT reset
      navigator.vibrate?.(10);
      notify(`已记录 ${recordText(next[0])}`);
    }
  };

  const toggleLamp = (code: string) => {
    if (error) return;
    const now = new Date();
    const marked = outerMarked(rowsRef.current, code, dayKey(now));
    const next = toggleOuter(rowsRef.current, code, now);
    if (mutate(next)) {
      setToday(dayKey(now)); setSelected(dayKey(now));
      navigator.vibrate?.(10);
      notify(marked ? `已取消 ${code}` : `已记录 ${recordText(next[0])}`);
    }
  };

  const list = rows.filter(r => r.day === selected);
  const todayRows = rows.filter(r => r.day === today);
  const dates = [...new Set([today, ...rows.map(r => r.day)])].sort().reverse();

  const copy = async () => {
    const text = list.map(recordText).join('\n');
    try { await navigator.clipboard.writeText(text); notify(`已复制 ${list.length} 条记录`); }
    catch {
      const el = document.createElement('textarea'); el.value = text; document.body.append(el); el.select();
      const ok = document.execCommand('copy'); el.remove(); notify(ok ? '已复制记录' : '复制失败，请长按记录复制');
    }
  };
  const exportCSV = () => {
    const url = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `设备故障记录_${today}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000); notify('已导出全部历史记录');
  };
  const navigate = (id: string) => {
    window.scrollTo(0, 0); setPage(id); setUncontrolled(false); setConfirm(false);
    if (id === 'outer') setSelected(dayKey());
  };

  const recentToday = (
    todayRows.length > 0 && (
      <div className="recent">
        <div className="recent-head"><span>今日记录 · {todayRows.length} 条（最新在上）</span><button onClick={undoLast} disabled={!canUndo}>撤销上一项</button></div>
        <ol className="records compact">
          {todayRows.slice(0, 8).map(r => (
            <li key={r.id}>
              <div className="record-info">
                <div className="record-line">{isOuter(r) && <span className="roof-tag">{r.roof}，</span>}<b>{r.code}</b>{r.fault && <span className="fault-tag">{r.fault}</span>}</div>
                <small>{new Date(r.time).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</small>
              </div>
            </li>
          ))}
        </ol>
        {todayRows.length > 8 && <p className="hint">仅显示最近 8 条，全部记录在主界面查看。</p>}
      </div>
    )
  );

  const gardenDeck = page === 'garden' && (
    <div className="deck">
      <div className="deck-head">
        <strong>{tower ? `T${tower} · 选择灯具` : '先选塔号'}</strong>
        <span className="deck-count">今日 {todayRows.length} 条</span>
        <button disabled={!canUndo} onClick={undoLast}>撤销上一项</button>
      </div>
      <div className="tower-strip" role="group" aria-label="选择塔号">
        {Array.from({ length: 9 }, (_, i) => i + 1).map(n => (
          <button key={n} className={n === tower ? 'active' : ''} aria-pressed={n === tower} onClick={() => { setTower(n); setUncontrolled(false); }}>T{n}</button>
        ))}
      </div>
      <div className="segmented" role="group" aria-label="故障类型">
        <button className={!uncontrolled ? 'active' : ''} aria-pressed={!uncontrolled} disabled={tower === null} onClick={() => setUncontrolled(false)}>不亮</button>
        <button className={uncontrolled ? 'active bad' : ''} aria-pressed={uncontrolled} disabled={tower === null} onClick={() => setUncontrolled(true)}>不受控</button>
      </div>
      <div className="grid lamps">
        {Array.from({ length: 8 }, (_, i) => i + 1).map(n => (
          <button disabled={!!error || tower === null} className="device" key={n} onClick={() => add(n)}>
            <strong>{n}号</strong><small>{tower ? `7${tower}${String(n).padStart(2, '0')}` : '先选塔'}</small>
          </button>
        ))}
      </div>
      <p className="deck-hint">{tower ? '点灯号即记录，留在当前塔可连续记录' : '点上方塔号，再点灯号即记录'}</p>
    </div>
  );

  return (
    <div className={page === 'garden' ? 'app has-deck' : 'app'}>
      <header>
        <div className="eyebrow"><span>舞台技术 · 设备测试</span><span className="version">V1.4</span></div>
        <div className="title-row">
          <h1>设备故障快速记录系统</h1>
          <div className="count"><strong>{todayRows.length}</strong><span>今日故障</span></div>
        </div>
        <div className="meta">{today.replace(/-/, '年').replace(/-/, '月')}日 · 上海时间 · 自动保存至本机</div>
      </header>

      {updateReady && <button className="update-banner" onClick={() => location.reload()}>新版本已准备好 · 点击更新（保留记录）</button>}
      {error && <div role="alert" className="error">{error}</div>}

      <main>
        {page === 'home' ? (
          <>
            <div className="section-title">
              <h2>故障记录</h2>
              <label className="date-select">日期 <select aria-label="查看日期" value={selected} onChange={e => setSelected(e.target.value)}>{dates.map(d => <option key={d} value={d}>{d === today ? '今天' : d}</option>)}</select></label>
            </div>
            <div className="tools">
              <button disabled={!list.length} onClick={copy}>复制记录</button>
              <button disabled={!rows.length} onClick={exportCSV}>导出CSV</button>
              <button disabled={!canUndo} onClick={undoLast}>撤销上一项</button>
            </div>
            <div className="list-heading"><span>{selected === today ? '今日' : selected} · {list.length} 条记录</span><button className="danger text" disabled={!list.length || !!error} onClick={() => setConfirm(true)}>清空此日</button></div>
            {list.length ? (
              <ol className="records">
                {list.map((r, i) => (
                  <li key={r.id}>
                    <span className="record-index">{String(list.length - i).padStart(2, '0')}</span>
                    <div className="record-info">
                      <div className="record-line">{isOuter(r) && <span className="roof-tag">{r.roof}，</span>}<b>{r.code}</b>{r.fault && <span className="fault-tag">{r.fault}</span>}</div>
                      <small>{r.area ? `${r.area} · ` : r.fault ? '' : '原有记录 · '}{r.region} · {new Date(r.time).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</small>
                    </div>
                    <button aria-label={`删除 ${r.code}`} disabled={!!error} className="delete" onClick={() => { if (mutate(rowsRef.current.filter(x => x.id !== r.id))) notify(`已删除 ${r.code}`); }}>删除</button>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="empty"><h3>准备就绪，开始测试</h3><p>点击底部区域，快速记录故障设备<br />每次点击都会单独记录，支持重复编号</p></div>
            )}
            <aside>记录仅保存在当前设备的当前浏览器，其他设备不会自动同步。清除浏览器数据可能丢失记录，请定期导出CSV备份。<br />Safari 分享 → 添加到主屏幕，即可像App一样使用。</aside>
          </>
        ) : (
          <>
            <div className="section-title">
              <button className="back" onClick={() => navigate('home')}>‹ 返回记录</button>
              <span className="badge">{page === 'garden' ? '花园' : regions.find(r => r.id === page)?.name}</span>
            </div>

            {page === 'garden' ? (
              <>
                <p className="hint">在下方操作台点选即记录，最新记录会出现在这里。</p>
                {recentToday || <div className="empty"><h3>今日暂无记录</h3><p>听到对讲机报告后，在下方操作台点塔号和灯号即可。</p></div>}
              </>
            ) : page === 'outer' ? (
              <>
                <h2 className="choose-title">外围灯</h2>
                <p className="hint">仅标记今天 · 绿色未标记，红色已记录，再点红色可取消。</p>
                <div className="outer-summary"><span>7个区域 · 27台灯具</span><button disabled={!canUndo} onClick={undoLast}>撤销上一项</button></div>
                <div className="area-chips">
                  {roofs.map((g: any) => (
                    <button key={g.roof} onClick={() => document.getElementById(`roof-${g.roof}`)?.scrollIntoView({ behavior: 'auto', block: 'start' })}>{g.name}</button>
                  ))}
                </div>
                <div className="roof-list">
                  {roofs.map((group: any) => (
                    <section className="roof-group" id={`roof-${group.roof}`} key={group.roof}>
                      <h3>{group.name}<span>（{group.roof}）</span></h3>
                      <div className="outer-grid">
                        {group.codes.map((code: string) => {
                          const marked = outerMarked(rows, code, today);
                          return (
                            <button key={code} disabled={!!error} aria-label={`${group.roof} ${code}`} aria-pressed={marked} className={marked ? 'outer-lamp marked' : 'outer-lamp'} onClick={() => toggleLamp(code)}>
                              <strong>{code}</strong><small>{marked ? '已记录 · 点击取消' : '未标记'}</small>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
                {recentToday}
              </>
            ) : (
              <div className="empty"><h3>城堡 · 设备编号配置待完善</h3><p>本次需求未提供城堡的设备数量与编号规则，<br />未擅自编造编号。补充规则后可按花园/外围灯相同方式接入。</p><button onClick={() => navigate('home')}>返回主界面</button></div>
            )}
          </>
        )}
      </main>

      {gardenDeck}

      <nav aria-label="设备区域">
        {regions.map((r: any) => (
          <button key={r.id} className={page === r.id ? 'active' : ''} onClick={() => navigate(r.id)}>
            {r.id === 'garden' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="6.4" r="2.3"/><circle cx="16.9" cy="9.7" r="2.3"/><circle cx="15.5" cy="15.9" r="2.3"/><circle cx="8.5" cy="15.9" r="2.3"/><circle cx="7.1" cy="9.7" r="2.3"/></svg>
            ) : r.id === 'outer' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 1 3.5 10.9c-.6.5-.9 1-1 2.1h-5c-.1-1.1-.4-1.6-1-2.1A6 6 0 0 1 12 3z"/><path d="M9.8 18.2h4.4M10.6 21h2.8"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21v-10.5h2.4V7.2h2.7v3.3h3.8V7.2h2.7v3.3H19V21"/><path d="M3.6 21h16.8"/><path d="M10.3 21v-3.4a1.7 1.7 0 0 1 3.4 0V21"/></svg>
            )}
            <span>{r.name}</span>
          </button>
        ))}
      </nav>

      {toast && <div role="status" className="toast">✓ {toast}</div>}
      {confirm && (
        <div className="scrim">
          <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <h3 id="confirm-title">清空{selected}的记录？</h3>
            <p>将删除该日全部 {list.length} 条记录。建议先导出备份。本次会话内可用“撤销上一项”恢复。</p>
            <button onClick={() => setConfirm(false)}>保留记录</button>
            <button className="danger" onClick={() => { if (mutate(rowsRef.current.filter(r => r.day !== selected))) notify('已清空所选日期'); setConfirm(false); }}>确认清空</button>
          </section>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {}); });
