import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore plain ESM logic with unit tests
import { ACCOUNTS, apiLogin, apiChangePassword, apiLogout, authedApi, loadSession } from './cloud.mjs';

type Session = { token: string; username: string; name: string; mustChange: boolean };

const AVATAR_PREFIX = 'toolbox-avatar-v1:';
export const avatarKey = (username: string) => AVATAR_PREFIX + username;
export function loadAvatar(username: string) {
  try { return localStorage.getItem(avatarKey(username)) || '/avatar-default.jpg'; } catch { return '/avatar-default.jpg'; }
}

const ERR: Record<string, string> = {
  NO_USER: '账号不存在，请确认名字选对了',
  BAD_PASSWORD: '密码不对，再试一次',
  BAD_OLD_PASSWORD: '原密码不对',
  PW_TOO_SHORT: '新密码至少 6 位',
  NOT_LOGGED_IN: '登录已过期，请重新登录',
  BAD_RESPONSE: '网络不太顺，稍后再试',
  NETWORK: '网络不太顺，稍后再试',
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

  useEffect(() => { if (session) setAvatar(loadAvatar(session.username)); }, [session && session.username]);

  // Verify the stored session is still valid; drop it if the backend says no.
  useEffect(() => {
    if (!session) return;
    authedApi(localStorage)({ action: 'me' }).catch((e: any) => {
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
    img.onload = () => {
      try {
        const S = 512;
        const c = document.createElement('canvas'); c.width = S; c.height = S;
        const ctx = c.getContext('2d'); if (!ctx) return;
        const scale = Math.max(S / img.width, S / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        const data = c.toDataURL('image/jpeg', 0.85);
        try { localStorage.setItem(avatarKey(session.username), data); } catch {}
        setAvatar(data);
        notify('头像已更新');
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
          </select>
          <label className="mine-cap">密码</label>
          <input className="mine-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="初始密码 12345678" autoComplete="current-password" onKeyDown={e => { if (e.key === 'Enter') doLogin(); }} />
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

      <div className="mine-sect">关于</div>
      <div className="mecard">
        <div className="inforow"><span className="k">版本</span><span className="v">舞台工具箱 V1.6.2</span></div>
        <div className="inforow"><span className="k">数据</span><span className="v">故障记录存云端团队空间，本机留缓存</span></div>
        <div className="inforow"><span className="k">头像</span><span className="v">保存在这台手机上</span></div>
      </div>
      <button className="mine-reload" onClick={() => location.reload()}>重新加载最新版</button>
      <button className="me-btn" onClick={doLogout}>退出登录</button>
    </div>
  );
}
