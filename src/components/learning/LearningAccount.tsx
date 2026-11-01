'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LearningAccount, LearningAuth } from '@/lib/learning/firebase-client';
import { parseFirebaseConfig, signInError, type LearningScope } from '@/lib/learning/identity';

export function useLearningAuth() {
  const [account, setAccount] = useState<LearningAccount | null>(null);
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const service = useRef<LearningAuth | null>(null);
  const operation = useRef(false);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const initialize = async () => {
      try {
        const config = parseFirebaseConfig({
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        });
        if (!active) return;
        if (!config) { setReady(true); return; }
        setConfigured(true);
        const { createLearningAuth } = await import('@/lib/learning/firebase-client');
        if (!active) return;
        service.current = createLearningAuth(config);
        unsubscribe = service.current.subscribe((next) => {
          if (!active) return;
          setAccount(next);
          setReady(true);
        }, (cause) => {
          if (!active) return;
          setError(signInError(cause));
          setReady(false);
        });
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error && !('code' in cause) ? cause.message : signInError(cause));
        setReady(false);
      }
    };
    void initialize();
    return () => { active = false; unsubscribe?.(); service.current = null; };
  }, [attempt]);

  const authenticate = (action: 'signIn' | 'signOut') => {
    if (operation.current) return;
    const client = service.current;
    if (!client || !ready) {
      setError('登入服務未準備好，請重試。你仍然可以用訪客模式學習。');
      return;
    }
    operation.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    // Invoke directly in the click handler so popup creation keeps the user gesture.
    void client[action]().then(() => {
      setNotice(action === 'signIn'
        ? 'Google 登入完成。登入唔等於同步完成，請查看下面嘅同步狀態。'
        : '已登出。帳戶本機副本仍然保留；而家顯示嘅係訪客資料。');
    }).catch((cause: unknown) => setError(signInError(cause))).finally(() => {
      operation.current = false;
      setBusy(false);
    });
  };
  const getToken = useCallback((scope: LearningScope) => {
    if (!service.current) return Promise.reject(new Error('登入服務未準備好，同步已停止。'));
    return service.current.token(scope);
  }, []);
  return {
    account, ready, configured, busy, error, notice,
    signIn: () => authenticate('signIn'),
    signOut: () => authenticate('signOut'),
    getToken,
    retry: () => { setError(''); setReady(false); setAttempt((value) => value + 1); },
  };
}
export type LearningIdentity = ReturnType<typeof useLearningAuth>;

export function LearningAccountControls({ identity, saving }: { identity: LearningIdentity; saving: boolean }) {
  const disabled = identity.busy || saving || !identity.ready;
  return <section className="lp-panel" aria-labelledby="learning-account-title">
    <h2 id="learning-account-title">帳戶與資料</h2>
    <p>{identity.account ? `已登入：${identity.account.name}` : '訪客模式：唔需要註冊都可以學習。'}</p>
    <p className="lp-muted">Google 登入只用作識別帳戶，唔會讀取你嘅 Gmail 或 Google Drive。雲端同步要喺下面另外啟用；未啟用前，卡片、SRS 同測驗只存喺呢個瀏覽器。</p>
    {identity.configured ? <div className="lp-actions">
      {identity.account
        ? <button type="button" className="lp-button" disabled={disabled} onClick={identity.signOut}>登出並返回訪客模式</button>
        : <button type="button" className="lp-button primary" disabled={disabled} onClick={identity.signIn}>使用 Google 登入</button>}
      {!identity.ready && !identity.error && <p role="status">正在準備登入服務；你可以繼續本機學習。</p>}
      {identity.busy && <p role="status">正在處理帳戶操作…</p>}
    </div> : <p className="lp-muted">{identity.ready ? '呢個版本未設定 Google 登入；訪客功能照常可用。' : '正在檢查登入設定…'}</p>}
    {identity.error && <div role="alert" className="lp-error">{identity.error}
      <button type="button" disabled={identity.busy || saving} onClick={identity.retry}>重試登入服務</button>
    </div>}
    {identity.notice && <p role="status">{identity.notice}</p>}
    <p className="lp-muted">訪客同每個 Google 帳戶分開儲存，唔會自動合併。登入狀態會保留到你登出；登出唔會刪除本機副本。本機副本未加密，唔適合喺唔可信嘅共用裝置保存私人資料。</p>
  </section>;
}
