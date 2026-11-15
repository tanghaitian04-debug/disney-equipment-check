import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore plain ESM logic with unit tests
import { ACCOUNTS, MANAGER_ACCOUNTS, apiLogin, apiChangePassword, apiLogout, apiSetAvatar, apiSetJoinDate, apiGetShows, apiSetShows, apiGetRosterMeta, apiSetRosterPdf, authedApi, loadSession } from './cloud.mjs';
// @ts-ignore bundled fallback for the shows editor
import { SHOWS } from './showdata.mjs';
// @ts-ignore generated from the weekly roster PDF (see ~/workspace/roster-tools/parse_roster.py)
import { ROSTER } from './rosterdata.mjs';

type Session = { token: string; username: string; name: string; mustChange: boolean; role?: string; avatar?: string | null; joinDate?: string | null };

const AVATAR_PREFIX = 'toolbox-avatar-v1:';
export const avatarKey = (username: string) => AVATAR_PREFIX + username;
export function loadAvatar(username: string) {
  try { return localStorage.getItem(avatarKey(username)) || '/avatar-default.jpg'; } catch { return '/avatar-default.jpg'; }
}

const JOIN_PREFIX = 'toolbox-joindate-v1:';
const joinKey = (username: string) => JOIN_PREFIX + username;
function loadJoin(username: string): string | null {
  try { return localStorage.getItem(joinKey(username)) || null; } catch { return null; }
}
function beijingTodayKey(): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = (t: string) => (parts.find(x => x.type === t) || { value: '' }).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
function daysBetween(fromKey: string, toKey: string): number {
  const a = fromKey.split('-').map(Number);
  const b = toKey.split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}
function prettyDate(key: string): string {
  const a = key.split('-').map(Number);
  return `${a[0]}年${a[1]}月${a[2]}日`;
}
const CASTLE = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.6v2.2" /><path d="M12 2.6l2.8.9-2.8.9" fill="currentColor" stroke="none" /><path d="M9.6 7.6L12 5.2l2.4 2.4" /><path d="M10.1 7.4v5.1h3.8V7.4" /><path d="M4.6 21v-9.4L6.1 9.9l1.5 1.7V21" /><path d="M16.4 21v-9.4l1.5-1.7 1.5 1.7V21" /><path d="M7.6 15h2.5M13.9 15h2.5" /><path d="M10.9 21v-2.5a1.1 1.1 0 0 1 2.2 0V21" /><path d="M4.6 21h14.8" /></svg>;

const ERR: Record<string, string> = {
  NO_USER: '账号不存在，请确认名字选对了',
  BAD_PASSWORD: '密码不对，再试一次',
  BAD_OLD_PASSWORD: '原密码不对',
  PW_TOO_SHORT: '新密码至少 6 位',
  NOT_LOGGED_IN: '登录已过期，请重新登录',
  BAD_RESPONSE: '网络不太顺，稍后再试',
  NETWORK: '网络不太顺，稍后再试',
  BAD_JOINDATE: '日期格式不对',
  FORBIDDEN: '只有经理账号可以编辑',
  BAD_SHOWS: '场次信息格式不对，请检查日期',
  BAD_PDF: 'PDF 不对或文件太大',
};
const errText = (e: any) => ERR[(e && e.code) || ''] || '网络不太顺，稍后再试';

export function MineApp({ session, onSession, notify }: { session: Session | null; onSession: (s: Session | null) => void; notify: (m: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [avatar, setAvatar] = useState<string>('/avatar-default.jpg');
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwOpen, setPwOpen] = useState(false);
  const [pwErr, setPwErr] = useState('');
  const [pwOk, setPwOk] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [joinDate, setJoinDateState] = useState<string | null>(null);
  const [joinEdit, setJoinEdit] = useState(false);
  const [joinInput, setJoinInput] = useState('');
  const [todayKey, setTodayKey] = useState<string>(beijingTodayKey);
  const isManager = !!(session && session.role === 'manager');
  const [mgrRows, setMgrRows] = useState<any[]>([]);
  const [pdfMeta, setPdfMeta] = useState<any>(null);
  const [pdfLabel, setPdfLabel] = useState('');
  const [pdfB64, setPdfB64] = useState('');
  const [mgrBusy, setMgrBusy] = useState(false);
  useEffect(() => {
    if (!isManager) return;
    apiGetShows().then((list: any) => setMgrRows(Array.isArray(list) && list.length ? list : SHOWS)).catch(() => setMgrRows(SHOWS));
    apiGetRosterMeta().then((m: any) => setPdfMeta(m)).catch(() => {});
  }, [isManager]);
  const saveShows = async () => {
    const entries = mgrRows.filter((r: any) => r.date).map((r: any) => ({ date: r.date, text: String(r.text || '').trim() }));
    setMgrBusy(true);
    try { await apiSetShows(localStorage, entries); notify('演出场次已保存，首页已更新'); }
    catch (e: any) { notify(errText(e)); }
    setMgrBusy(false);
  };
  const pickPdf = (e: any) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 2200000) { notify('PDF 太大（上限约 2MB）'); return; }
    const rd = new FileReader();
    rd.onload = () => { const url = String(rd.result || ''); setPdfB64(url.slice(url.indexOf(',') + 1)); };
    rd.readAsDataURL(f);
  };
  const uploadPdf = async () => {
    if (!pdfB64) return;
    setMgrBusy(true);
    try {
      await apiSetRosterPdf(localStorage, pdfB64, pdfLabel.trim());
      setPdfB64('');
      setPdfMeta(await apiGetRosterMeta());
      notify('首页班表 PDF 已更新');
    } catch (e: any) { notify(errText(e)); }
    setMgrBusy(false);
  };

  useEffect(() => { if (session) setJoinDateState(session.joinDate || loadJoin(session.username)); }, [session && session.username]);

  // The day counter follows the Beijing calendar: refresh todayKey whenever the page resurfaces.
  useEffect(() => {
    const f = () => setTodayKey(beijingTodayKey());
    document.addEventListener('visibilitychange', f);
    window.addEventListener('focus', f);
    return () => { document.removeEventListener('visibilitychange', f); window.removeEventListener('focus', f); };
  }, []);

  useEffect(() => { if (session) setAvatar(session.avatar || loadAvatar(session.username)); }, [session && session.username, session && session.avatar]);

  // On open: verify the session, pull the account avatar from the cloud, and if this
  // phone still holds a locally-saved avatar that the cloud does not have yet
  // (saved before avatars synced), upload it once so it follows the account.
  const migratedRef = useRef(false);
  const joinMigratedRef = useRef(false);
  useEffect(() => {
    if (!session) return;
    authedApi(localStorage)({ action: 'me' }).then(async (r: any) => {
      const cloudAvatar = r && typeof r.avatar !== 'undefined' ? r.avatar : undefined;
      if (cloudAvatar) {
        if (cloudAvatar !== session.avatar) {
          try { localStorage.setItem(avatarKey(session.username), cloudAvatar); } catch {}
          const cur = loadSession(localStorage);
          if (cur) onSession({ ...(cur as any), avatar: cloudAvatar });
        }
      } else if (cloudAvatar === null && !migratedRef.current) {
        migratedRef.current = true;
        let local = null;
        try { local = localStorage.getItem(avatarKey(session.username)); } catch {}
        if (local) {
          try { const next = await apiSetAvatar(localStorage, local); if (next) onSession(next as Session); } catch {}
        }
      }
      const cloudJoin = r && typeof r.joinDate !== 'undefined' ? r.joinDate : undefined;
      if (cloudJoin) {
        try { localStorage.setItem(joinKey(session.username), cloudJoin); } catch {}
        setJoinDateState(cloudJoin);
        const cur2 = loadSession(localStorage);
        if (cur2 && (cur2 as any).joinDate !== cloudJoin) onSession({ ...(cur2 as any), joinDate: cloudJoin });
      } else if (cloudJoin === null && !joinMigratedRef.current) {
        joinMigratedRef.current = true;
        const localJ = loadJoin(session.username);
        if (localJ) {
          setJoinDateState(localJ);
          try { const next = await apiSetJoinDate(localStorage, localJ); if (next) onSession(next as Session); } catch {}
        }
      }
    }).catch((e: any) => {
      if (e && e.code === 'NOT_LOGGED_IN') { onSession(null); notify('登录已过期，请重新登录'); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doLogin = async () => {
    if (!username) { setLoginErr('先选一下你的名字'); return; }
    if (!password) { setLoginErr('请输入密码'); return; }
    setBusy(true); setLoginErr('');
    try {
      const s = await apiLogin(localStorage, username, password);
      onSession(s as Session);
      setPassword('');
      notify(`欢迎回来，${s.name}`);
      if (s.mustChange) setTimeout(() => notify('你还在用初始密码，建议在下面改掉'), 2600);
    } catch (e) { setLoginErr(errText(e)); }
    setBusy(false);
  };

  const doChangePw = async () => {
    setPwErr(''); setPwOk('');
    if (!oldPw) { setPwErr('请输入原密码'); return; }
    if (newPw.length < 6) { setPwErr('新密码至少 6 位'); return; }
    if (newPw !== newPw2) { setPwErr('两次输入的新密码不一致'); return; }
    setBusy(true);
    try {
      await apiChangePassword(localStorage, oldPw, newPw);
      setOldPw(''); setNewPw(''); setNewPw2('');
      setPwOk('密码已修改，下次登录用新密码');
      const s = loadSession(localStorage);
      if (s) onSession(s as Session);
    } catch (e) { setPwErr(errText(e)); }
    setBusy(false);
  };

  const doSaveJoin = async () => {
    if (!session) return;
    if (!joinInput) { notify('先选一下入职日期'); return; }
    setJoinDateState(joinInput);
    try { localStorage.setItem(joinKey(session.username), joinInput); } catch {}
    setJoinEdit(false);
    try {
      const next = await apiSetJoinDate(localStorage, joinInput);
      if (next) onSession(next as Session);
      notify('入职日期已保存，天数会每天自动更新');
    } catch { notify('入职日期先存这台手机，网络恢复后会自动同步'); }
  };

  const doLogout = () => {
    if (!confirm('退出登录？退出后「设备」和「故障全览」需要重新登录才能用。')) return;
    apiLogout(localStorage);
    onSession(null);
    notify('已退出登录');
  };

  const onAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f || !session) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = async () => {
      try {
        const S = 256;
        const c = document.createElement('canvas'); c.width = S; c.height = S;
        const ctx = c.getContext('2d'); if (!ctx) return;
        const scale = Math.max(S / img.width, S / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        const data = c.toDataURL('image/jpeg', 0.85);
        try { localStorage.setItem(avatarKey(session.username), data); } catch {}
        setAvatar(data);
        try {
          const next = await apiSetAvatar(localStorage, data);
          if (next) onSession(next as Session);
          notify('头像已更新，已同步到你的账号');
        } catch { notify('头像先存这台手机，网络恢复后会自动同步'); }
      } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); notify('这张图片读不了，换一张试试'); };
    img.src = url;
  };

  if (!session) {
    return (
      <div className="mine-root">
        <div className="mine-herocard">
          <img className="mine-bigavatar" src="/avatar-default.jpg" alt="默认头像" />
          <h2>登录后开启团队同步</h2>
          <p>用你自己的账号登录，故障记录会实时同步到全班：<br />谁记的、什么时候记的，大家打开就能看到。</p>
        </div>
        <div className="mine-form">
          <label className="mine-cap">你的名字</label>
          <select className="mine-input" value={username} onChange={e => setUsername(e.target.value)}>
            <option value="">请选择你的名字</option>
            {ACCOUNTS.map((a: any) => <option key={a.username} value={a.username}>{a.name}</option>)}
            <option disabled>—— 经理 ——</option>
            {MANAGER_ACCOUNTS.map((a: any) => <option key={a.username} value={a.username}>{a.name}</option>)}
          </select>
          <label className="mine-cap">密码</label>
          <input className="mine-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="请输入密码" autoComplete="current-password" onKeyDown={e => { if (e.key === 'Enter') doLogin(); }} />
          {loginErr && <div className="mine-err">{loginErr}</div>}
          <button className="mine-primary" disabled={busy} onClick={doLogin}>{busy ? '登录中…' : '登录'}</button>
          <p className="mine-note">第一次登录用初始密码 12345678，登录后建议马上改成你自己的密码。排班功能不用登录也能用。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mine-root">
      <div className="mine-profile">
        <button className="mine-avatarbtn" onClick={() => fileRef.current && fileRef.current.click()} aria-label="更换头像">
          <img src={avatar} alt="头像" />
          <span className="mine-avatarhint">更换</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onAvatarFile} />
        <div className="mine-who">
          <div className="mine-name">{session.name}</div>
          <div className="mine-uname">{`账号：${session.username}`}</div>
          <div className="mine-syncok">云端同步已开启</div>
        </div>
      </div>

      {session.mustChange && <div className="mine-warn">你还在用初始密码 12345678，建议现在就改掉，账号更安全。</div>}

      <button className="join-card" onClick={() => { setJoinInput(joinDate || todayKey); setJoinEdit(true); }}>
        <span className="join-wm">{CASTLE}</span>
        <span className="join-label">✦ 加入迪士尼 ✦</span>
        <span className="join-numrow"><span className="join-num">{joinDate ? Math.max(0, daysBetween(joinDate, todayKey)) : 0}</span><span className="join-unit">天</span></span>
        <span className="join-sub">{joinDate ? `自 ${prettyDate(joinDate)} 入职 · 点按修改` : '点按设置你的入职日期'}</span>
      </button>
      {joinEdit && (
        <div className="join-edit">
          <label className="mine-cap">入职日期</label>
          <input className="mine-input" type="date" value={joinInput} max={todayKey} onChange={e => setJoinInput(e.target.value)} />
          <div className="join-edit-btns">
            <button className="mine-primary ghost" onClick={doSaveJoin}>保存</button>
            <button className="mine-reload" onClick={() => setJoinEdit(false)}>取消</button>
          </div>
        </div>
      )}

      {(() => {
        const mine = (ROSTER.people as any)[session.name] as { date: string; shift: string; pos: string }[] | undefined;
        if (!mine) return null;
        const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const md = (k: string) => { const a = k.split('-').map(Number); return `${a[1]}月${a[2]}日`; };
        return (
          <>
            <div className="mine-sect">我的岗位</div>
            <div className="mecard mypost-card">
              <div className="mypost-week">{`本周 · ${md(ROSTER.week[0])} – ${md(ROSTER.week[6])}`}</div>
              {mine.map((d, i) => (
                <div key={d.date} className={'mypost-row' + (d.date === todayKey ? ' today' : '')}>
                  <span className="mypost-date">{md(d.date)}</span>
                  <span className="mypost-wd">{WD[i]}</span>
                  <span className={'mypost-pos' + (d.pos === 'OFF' || d.pos === '空着' ? ' dim' : '')}>{d.pos}{d.shift && d.shift !== 'OFF' ? `（${d.shift}）` : ''}</span>
                  {d.date === todayKey && <span className="mypost-today">今天</span>}
                </div>
              ))}
            </div>
          </>
        );
      })()}

      {isManager && (
        <>
          <div className="mine-sect">管理编辑</div>
          <div className="mecard mgr-card">
            <div className="mgr-sub">编辑演出场次（首页）</div>
            {mgrRows.map((r: any, i: number) => (
              <div key={i} className="mgr-row">
                <input type="date" className="mine-input mgr-date" value={r.date} onChange={e => setMgrRows(mgrRows.map((x: any, j: number) => j === i ? { ...x, date: e.target.value } : x))} />
                <input className="mine-input" value={r.text} placeholder="（两场）20:00 21:15" onChange={e => setMgrRows(mgrRows.map((x: any, j: number) => j === i ? { ...x, text: e.target.value } : x))} />
                <button type="button" className="mgr-del" onClick={() => setMgrRows(mgrRows.filter((_: any, j: number) => j !== i))}>✕</button>
              </div>
            ))}
            <button type="button" className="mine-reload" onClick={() => setMgrRows([...mgrRows, { date: '', text: '' }])}>＋ 添加一天</button>
            <button type="button" className="mine-primary" disabled={mgrBusy} onClick={saveShows}>{mgrBusy ? '保存中…' : '保存场次'}</button>
            <div className="mgr-sub">更换首页班表 PDF</div>
            <div className="mgr-note">{pdfMeta && pdfMeta.hasPdf ? `当前 PDF：${pdfMeta.label || '班表'}（${pdfMeta.updatedBy || ''} 上传）` : '当前使用网站内置 PDF，尚未上传过。'}</div>
            <input className="mine-input" value={pdfLabel} placeholder="标注，如：11月22日 – 11月28日" onChange={e => setPdfLabel(e.target.value)} />
            <input type="file" accept="application/pdf" className="mgr-file" onChange={pickPdf} />
            <button type="button" className="mine-primary" disabled={mgrBusy || !pdfB64} onClick={uploadPdf}>{mgrBusy ? '上传中…' : '上传并替换首页 PDF'}</button>
            <div className="mgr-note">上传后首页班表立即生效；「我的岗位」仍按周更新，换完请把 PDF 同步发管理员一份。</div>
          </div>
        </>
      )}

      <div className="mine-sect">修改密码</div>
      {!(session.mustChange || pwOpen) ? (
        <button className="mine-reload" style={{ marginTop: 10 }} onClick={() => setPwOpen(true)}>修改密码</button>
      ) : (
      <div className="mine-form">
        <label className="mine-cap">原密码</label>
        <input className="mine-input" type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} autoComplete="current-password" />
        <label className="mine-cap">新密码（至少 6 位）</label>
        <input className="mine-input" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} autoComplete="new-password" />
        <label className="mine-cap">再输一次新密码</label>
        <input className="mine-input" type="password" value={newPw2} onChange={e => setNewPw2(e.target.value)} autoComplete="new-password" onKeyDown={e => { if (e.key === 'Enter') doChangePw(); }} />
        {pwErr && <div className="mine-err">{pwErr}</div>}
        {pwOk && <div className="mine-ok">{pwOk}</div>}
        <button className="mine-primary ghost" disabled={busy} onClick={doChangePw}>{busy ? '提交中…' : '确认修改密码'}</button>
      </div>
      )}

      <button className="mine-reload" onClick={() => location.reload()}>重新加载最新版</button>
      <button className="me-btn" onClick={doLogout}>退出登录</button>
    </div>
  );
}
