import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const PEOPLE = ['郑思瑜', '马强', '贺坤华', '刘庭旭', '邵成海', '钱佳恩', '闫国豪', '陈军', '刘伟伟', '唐海添', '聂国标', '李东绪', '赵国华', '罗光荣', '张禹', '陈财', '张云翔'];
const POSITIONS = ['控台', '视频', '观察A', '观察B', '激光X', '激光3', '激光2', '自动化', '台仓1', '台仓2', '特效', '激光观察员'];
const SLOT_OF: Record<string, string> = {
  '控台': '控台操作员', '视频': '视频操作员', '观察A': '观察A', '观察B': '观察B',
  '激光X': '激光操作员', '激光3': '激光3', '激光2': '激光观察员',
  '自动化': '自动化', '台仓1': '台仓1', '台仓2': '台仓2', '特效': '特效观察', '激光观察员': '激光观察员',
};
const SLOTS = ['激光操作员', '观察A', '观察B', '控台操作员', '视频操作员', '激光3', '自动化', '台仓1', '台仓2', '特效观察', '激光观察员'];
const TEMPLATE: string[] = ["%%DATE%%", "\u821e\u53f0\u6280\u5e08\u5de5\u4f5c\u5b89\u6392:", "", "\u3010\u6fc0\u5149\u64cd\u4f5c\u5458\u3011: %%\u6fc0\u5149\u64cd\u4f5c\u5458%%", "\u3010\u89c2\u5bdfA\u3011:%%\u89c2\u5bdfA%%", "\u3010\u89c2\u5bdfB\u3011:%%\u89c2\u5bdfB%%", "\u9884\u8bbe\u5185\u5bb9\uff1a17:00\u524d\u786e\u8ba4\u7687\u5bb6\u5bb4\u4f1a\u5385\u7a97\u5e18\u9884\u8bbe\u5b8c\u6210\uff1b\u9884\u8bbe\uff1a\u6d4b\u8bd5\u6fc0\u5149\u4f4e\u529f\u7387 \u5f00219A B\u7a97\u6237\u3001\u6d4b\u8bd5 \u6c34\u5e55/\u55b7\u6cc9/\u706f\u5149/\u6295\u5f71\uff0c\u88c5\u4e8c\u697c\u6321\u677f\uff0c\u4e5d\u7c73\u5e55\u5e03\uff0c   \u6f14\u51fa\u7ed3\u675f\uff1a\u5173\u95ed219A B\u7a97\u6237\uff0c\u4e8c\u697c\u6321\u677f\uff0c\u4e5d\u7c73\u5e55\u5e03\uff09\u6ce8\u610f\u89c2\u5bdf\u73af\u5883\u706f\u5149\u4ee5\u53cashow lighting\u72b6\u6001  \u68c0\u67e5\u9884\u8bbe\u4e24\u4fa7\u70ae\u697c\u548c\u4e2d\u95f4\u4f4d\u7f6e\u55b7\u82b1\u673a\u7c73\u5947\u8033\u6735", "", "\u3010\u63a7\u53f0\u64cd\u4f5c\u5458\u3011: %%\u63a7\u53f0\u64cd\u4f5c\u5458%%", "\u3010\u89c6\u9891\u64cd\u4f5c\u5458\u3011: %%\u89c6\u9891\u64cd\u4f5c\u5458%%", "\u3010\u6fc0\u51493\u3011: %%\u6fc0\u51493%%", "\u9884\u8bbe\u5de5\u4f5c\u5185\u5bb9\uff1a\u88c5\u6536\u821e\u53f0\u55b7\u82b1\u673a \u88c5\u6536\u821e\u53f0\u56f4\u6321\u5e03\uff08 \u6d4b\u8bd5\u82b1\u56ed\u706f\u4ee5\u53ca\u6fc0\u5149\uff0c\u6ce8\u610f\u89c2\u5bdf\u73af\u5883\u706f\u5149\u4ee5\u53cashow lighting\u72b6\u6001\u3001\u6f14\u51fa\u524d\u540e\u89c2\u5bdf\u6a61\u6811\u679c\u4e0a\u5347\u4e0b\u964d\u72b6\u51b5 \u5347\u964dcenter piece", "", "\u3010\u81ea\u52a8\u5316\u3011: %%\u81ea\u52a8\u5316%%", "  \u3010\u53f0\u4ed31\u3011: %%\u53f0\u4ed31%%", " \u3010\u53f0\u4ed32\u3011: %%\u53f0\u4ed32%%", "\u3010\u7279\u6548\u89c2\u5bdf\u3011:%%\u7279\u6548\u89c2\u5bdf%%", "\u9884\u8bbe\u5de5\u4f5c\u5185\u5bb9\uff1a\u5347\u964d\u706f\u5854 \u6c34\u5e55 C0106 \u7a97\u5e18 \uff0c\u6d4b\u8bd5\u821e\u53f0\u673a\u68b0\u4ee5\u53caLED\u5c4f\u5e55\u5347\u964d\u72b6\u6001\uff0c\u5f00\u5173\u821e\u53f0\u6295\u5f71\u673a\u76d6\u677f \u68c0\u67e5\u4e24\u4fa7\u706f\u5854LED\u7535\u6e90\u72b6\u6001  \u6d4b\u8bd5\u82b1\u56edLED\u706f\u67f1 \u82b1\u8f66\u5927\u9053LED\u72b6\u6001 \u6f14\u51fa\u4e2d\u89c2\u5bdf\u82b1\u56ed\u4ee5\u53ca\u5de1\u6e38\u5927\u9053\u55b7\u82b1\u673a \u70df\u673a\u7279\u6548\u72b6\u6001", "", "\u3010\u6fc0\u5149\u89c2\u5bdf\u5458\u3011\uff1a%%\u6fc0\u5149\u89c2\u5bdf\u5458%%\uff08\u5e26\u5927\u94a5\u5319\u67dc102\u53f7\u4e07\u80fd\u94a5\u5319\u3001\u9884\u8bbe\uff1a\u540e\u573a480\u6d4b\u8bd5&\u5347\u8d77\u3001\u68c0\u67e5205\u3001221\u5c4b\u9876\u6295\u5f71\u673a\u7a7a\u8c03\u3001\u6295\u5f71\u673a\u7a7a\u8c03\u6e7f\u5ea6\uff0c\u7c73\u5947\u5927\u8857\u5c4b\u9876\u68c0\u67e5\u4e0a\u9501\uff1b\u6f14\u51fa\u7ed3\u675f\uff1a\u7c73\u5947\u5927\u8857\u5c4b\u9876\u89e3\u9501\u3001\u964d\u540e\u573a480\u5e73\u53f0\uff09\u6ce8\u610f\u89c2\u5bdf\u73af\u5883\u706f\u5149\u4ee5\u53cashow lighting\u72b6\u6001"];

function slotAssignments(assign: Record<string, string>) {
  const out: Record<string, string[]> = {};
  for (const slot of SLOTS) out[slot] = [];
  for (const person of PEOPLE) {
    const pos = assign[person];
    if (pos && SLOT_OF[pos]) out[SLOT_OF[pos]].push(person);
  }
  return out;
}
function dateLabel(date = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date);
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  const y = get('year'), mo = get('month'), d = get('day');
  const wd = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  return { key: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, label: `${y}年${mo}月${d}日 ${wd}` };
}
function buildText(dateStr: string, assign: Record<string, string>) {
  const by = slotAssignments(assign);
  const n = (slot: string) => by[slot].join('、');
  return TEMPLATE.map(line => line === '%%DATE%%' ? dateStr : line.replace(/%%(.+?)%%/g, (_m, slot) => n(slot))).join('\n');
}

const STORE = 'stage-schedule-v1';

function App() {
  const [today] = useState(dateLabel);
  const [assign, setAssign] = useState<Record<string, string>>(() => {
    try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (s && s.dateKey === dateLabel().key && s.assign) return s.assign; } catch {}
    return {};
  });
  const [sheetPerson, setSheetPerson] = useState<string | null>(null);
  const [generated, setGenerated] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [toast, setToast] = useState('');
  const [updateReady, setUpdateReady] = useState(false);
  const [flash, setFlash] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify({ dateKey: today.key, assign })); } catch {} }, [assign, today.key]);
  useEffect(() => {
    const changed = () => setUpdateReady(true);
    navigator.serviceWorker?.addEventListener('controllerchange', changed);
    return () => navigator.serviceWorker?.removeEventListener('controllerchange', changed);
  }, []);
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
  const by = slotAssignments(assign);
  const filled = SLOTS.filter(s => by[s].length).length;
  const dupPositions = POSITIONS.filter(pos => (counts[pos] || 0) > 1);
  const missing = SLOTS.filter(s => !by[s].length);

  const focusNext = (after: string, next: Record<string, string>) => {
    const idx = PEOPLE.indexOf(after);
    for (let k = 1; k <= PEOPLE.length; k++) {
      const j = (idx + k) % PEOPLE.length;
      if (!next[PEOPLE[j]]) {
        setFlash(j);
        setTimeout(() => { document.getElementById(`person-${j}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60);
        setTimeout(() => setFlash(-1), 1300);
        break;
      }
    }
  };
  const pick = (pos: string) => {
    if (!sheetPerson) return;
    const next = { ...assign, [sheetPerson]: pos };
    setAssign(next); setSheetPerson(null);
    notify(`${sheetPerson} → ${pos}`);
    focusNext(sheetPerson, next);
  };
  const doGenerate = (scroll = true) => {
    setGenerated(buildText(today.label, assign));
    setShowPreview(true);
    if (scroll) setTimeout(() => document.getElementById('preview-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const doCopy = async () => {
    const text = buildText(today.label, assign);
    setGenerated(text); setShowPreview(true);
    try { await navigator.clipboard.writeText(text); notify('已复制，去微信群粘贴发送就行'); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove();
      notify(ok ? '已复制，去微信群粘贴发送就行' : '复制失败，请长按文案手动复制');
    }
  };

  return (
    <>
      <div className="app">
        <header>
          <div className="eyebrow"><span>每日排班</span><span>V1.0</span></div>
          <div className="title-row"><h1>舞台技师工作安排</h1><span id="date-line">{today.label}</span></div>
          <p className="meta">对照经理班表，点人名选岗位；选完点「生成文案」，再点「复制」发到微信群。日期按当天自动生成，不用手改。</p>
        </header>
        <div className="status">
          <span id="progress">{`岗位已填 ${filled} / ${SLOTS.length} · 已安排 ${Object.keys(assign).filter(k => assign[k]).length} 人`}</span>
          <button id="btn-clear" onClick={() => { if (Object.keys(assign).length && confirm('清空今天已选的全部岗位？')) { setAssign({}); setShowPreview(false); notify('已清空'); } }}>清空重选</button>
        </div>
        <div id="warn">{dupPositions.length ? `注意：${dupPositions.join('、')} 被选给了不止一个人` : ''}</div>
        <div id="list">
          {PEOPLE.map((person, i) => {
            const pos = assign[person];
            return (
              <button key={person} id={`person-${i}`} className={'person' + (flash === i ? ' flash' : '')} onClick={() => setSheetPerson(person)}>
                <span className="idx">{i + 1}</span><span className="pname">{person}</span>
                {pos ? <span className={'chip' + (counts[pos] > 1 ? ' dup' : '')}>{pos}</span> : <span className="chip none">未选择</span>}
                <span className="chev">›</span>
              </button>
            );
          })}
        </div>
        {showPreview && (
          <section id="preview-wrap" className="show">
            <h2>生成文案</h2>
            <div id="miss">{missing.length ? `还没选人的岗位：${missing.join('、')}（生成文案里会先空着）` : '11 个岗位都已填好，可以复制发送。'}</div>
            <pre id="preview">{generated}</pre>
          </section>
        )}
      </div>
      <div className="actionbar">
        <button id="btn-generate" onClick={() => { doGenerate(); navigator.vibrate?.(10); }}>生成文案</button>
        <button id="btn-copy" onClick={doCopy}>复制</button>
      </div>
      {sheetPerson && (
        <div id="sheet" className="open" role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget) setSheetPerson(null); }}>
          <div className="sheet-panel">
            <h3 id="sheet-name">{sheetPerson}</h3>
            <p className="sub">点一下今天的岗位（已有人选的岗位也能改派，文案里会并排显示）</p>
            <div id="chips">
              {POSITIONS.map(pos => {
                const taken = PEOPLE.some(p => p !== sheetPerson && assign[p] === pos);
                return (
                  <button key={pos} className={'pos' + (assign[sheetPerson] === pos ? ' active' : '') + (taken ? ' taken' : '')} onClick={() => pick(pos)}>
                    {pos + (taken ? '（已有人）' : '')}
                  </button>
                );
              })}
            </div>
            <div className="sheet-actions">
              <button id="sheet-clear" onClick={() => { const next = { ...assign }; delete next[sheetPerson]; setAssign(next); setSheetPerson(null); }}>不安排 / 清除</button>
              <button id="sheet-close" onClick={() => setSheetPerson(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div id="toast" className="show">{toast}</div>}
      {updateReady && <button className="update-banner" onClick={() => location.reload()}>新版本已准备好 · 点击更新（已选岗位不丢）</button>}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {}); });
