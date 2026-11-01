'use client';

import { useEffect, useRef, useState } from 'react';
import type { LearningScope } from '@/lib/learning/identity';
import type { LearningSnapshot } from '@/lib/learning/model';
import { importSummary } from '@/lib/learning/migration';
import { connectSync, downloadBackup, learningEvent, loadSync, resolveSettingsConflict, setSyncEnabled } from '@/lib/learning/store';
import { createSyncTransport, syncOnce, SyncRequestError, type SyncTransport } from '@/lib/learning/sync-client';
import { assertPreservedHistory, conflictingSettings, hasPendingChanges, initialSyncState, mergeCloud, sameData, syncInitialized, syncStatus, type CloudHead, type SettingChoices, type SettingKey, type SyncState } from '@/lib/learning/sync-model';

export function useCloudSync(scope: LearningScope, getToken: (scope: LearningScope) => Promise<string>) {
  const configured = process.env.NEXT_PUBLIC_LEARNING_SYNC_ENABLED === 'true';
  const [state, setState] = useState<SyncState>(initialSyncState);
  const [status, setStatus] = useState('僅本機');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const transport = useRef<SyncTransport | null>(null);
  const retry = useRef<() => void>(() => undefined);
  const lifecycle = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scope === 'guest' || !configured) return;
    let active = true;
    let running = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    lifecycle.current = controller;
    const queue = (delay: number) => { clearTimeout(timer); if (active) timer = setTimeout(() => void run(), delay); };
    const run = async () => {
      if (running || !active) return;
      running = true;
      try {
        const saved = await loadSync(scope);
        if (!active) return;
        setState(saved);
        setReady(true);
        if (!saved.enabled) { setStatus(syncStatus(saved)); return; }
        if (document.visibilityState === 'hidden') { setStatus('背景分頁 · 同步暫停'); return; }
        if (!navigator.onLine) { setStatus('離線待傳'); queue(60000); return; }
        if (!transport.current) throw new Error('同步 API 設定無效，請聯絡管理員。');
        setStatus('同步中');
        const next = await syncOnce(scope, transport.current, controller.signal);
        if (!active) return;
        setState(next);
        setError('');
        failures = 0;
        setStatus(syncStatus(next));
        if (next.enabled && !next.conflict) queue(next.outbox ? 500 : 60000);
      } catch (cause) {
        if (!active) return;
        setStatus(navigator.onLine ? '同步失敗 · 待傳資料已保留' : '離線待傳');
        setError(cause instanceof Error ? cause.message : '同步失敗，請重試。');
        failures += 1;
        if (!(cause instanceof SyncRequestError) || cause.retryable) queue(Math.min(60000, 1000 * 2 ** Math.min(failures, 6)));
      } finally { running = false; }
    };
    try {
      const base = process.env.NEXT_PUBLIC_LEARNING_ONLY === 'true' ? window.location.origin :
        process.env.NEXT_PUBLIC_LEARNING_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://jlpt-grammar-api.onrender.com';
      transport.current = createSyncTransport(base || window.location.origin, () => getToken(scope));
      queue(0);
    } catch (cause) {
      queueMicrotask(() => {
        if (active) {
          setStatus('同步設定有誤 · 僅本機');
          setError(cause instanceof Error ? cause.message : '同步設定無效。');
        }
      });
    }
    const changed = () => queue(500);
    const online = () => queue(0);
    const visible = () => {
      if (document.visibilityState === 'visible') queue(0);
      else clearTimeout(timer);
    };
    retry.current = online;
    window.addEventListener(learningEvent, changed);
    window.addEventListener('online', online);
    window.addEventListener('focus', online);
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
      transport.current = null;
      lifecycle.current = null;
      retry.current = () => undefined;
      window.removeEventListener(learningEvent, changed);
      window.removeEventListener('online', online);
      window.removeEventListener('focus', online);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [scope, getToken, configured]);

  return {
    configured, ready, state, status, error, retry: () => retry.current(),
    async inspect() {
      if (!transport.current) throw new Error('同步功能未設定好，請聯絡管理員。');
      return transport.current.read(lifecycle.current?.signal);
    },
    async connect(head: CloudHead) {
      setState(await connectSync(scope, head)); setStatus('等待同步'); setError(''); retry.current();
    },
    async toggle(enabled: boolean) {
      const next = await setSyncEnabled(scope, enabled);
      setState(next); setStatus(enabled ? '等待同步' : syncStatus(next)); setError(''); retry.current();
    },
    async resolve(local: LearningSnapshot, remote: CloudHead, choices: SettingChoices) {
      const next = await resolveSettingsConflict(scope, local, remote, choices);
      setState(next); setStatus(next.enabled ? '等待同步' : syncStatus(next)); setError(''); retry.current();
    },
  };
}
export type LearningSync = ReturnType<typeof useCloudSync>;

export function LearningCloud({ sync, snapshot, guest, saving }: {
  sync: LearningSync; snapshot: LearningSnapshot; guest: boolean; saving: boolean;
}) {
  const [head, setHead] = useState<CloudHead | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '同步操作失敗，請重試。'); }
    finally { setBusy(false); }
  };
  const summary = head?.snapshot ? importSummary(snapshot, head.snapshot) : null;
  const initialized = syncInitialized(sync.state);
  const disabled = busy || saving || !sync.ready;
  return <section className="lp-panel" aria-labelledby="learning-sync-title">
    <h2 id="learning-sync-title">雲端同步（預覽）</h2>
    <p role="status">{sync.status}</p>
    {!guest && sync.ready && <p className="lp-muted">
      {initialized ? `已確認雲端版本：${sync.state.head.revision}。${hasPendingChanges(snapshot, sync.state)
        ? '有本機修改未獲雲端確認。' : '冇待傳修改。'}` : '尚未連接雲端，資料只存喺本機。'}
      {initialized && !sync.state.enabled && ' 已暫停自動傳送；按「繼續自動同步」先會恢復。已發出嘅請求仍可能完成。'}
    </p>}
    <p className="lp-muted">只同步呢個 Google 帳戶分區嘅卡片、標籤、SRS、測驗同設定。訪客資料、登入憑證及舊 GitHub 資料唔會自動上傳。</p>
    {guest ? <p>登入後先可以選擇啟用。訪客學習唔受影響。</p> : !sync.configured
      ? <p>管理員未開放呢個版本嘅雲端同步。請繼續下載本機備份。</p>
      : <div className="lp-actions">
        {!sync.state.enabled && !initialized
          ? <button type="button" className="lp-button" disabled={disabled} onClick={() => void run(async () => {
            setHead(null); setConfirmed(false); setHead(await sync.inspect());
          })}>查看雲端資料及啟用預覽</button>
          : <button type="button" className="lp-button" disabled={disabled} onClick={() => void run(() => sync.toggle(!sync.state.enabled))}>
            {sync.state.enabled ? '暫停自動同步' : '繼續自動同步'}</button>}
        {sync.state.enabled && <button type="button" className="lp-button" disabled={disabled} onClick={sync.retry}>立即重試同步</button>}
      </div>}
    {(error || sync.error) && <p role="alert" className="lp-error">{error || sync.error}</p>}
    {busy && <p role="status">正在處理同步設定，請稍候；未完成前唔會顯示已同步。</p>}
    {head && !sync.state.enabled && !initialized && <div className="lp-import-preview">
      <h3>啟用前預覽</h3>
      <p>本機 {snapshot.items.length} 張 · 雲端 {head.snapshot?.items.length ?? 0} 張 · 雲端版本 {head.revision}</p>
      {summary && <p>新增 {summary.added} · 相同 {summary.identical} · 衝突 {summary.conflicts}</p>}
      <p>首次合併保留本機設定；之後設定修改亦會同步。同 ID 不同內容會中止，唔會猜測覆蓋。</p>
      <div className="lp-actions">
        <button type="button" className="lp-button" onClick={() => downloadBackup(snapshot, 'nihongo-local-before-sync.json')}>下載啟用前本機備份</button>
        {head.snapshot && <button type="button" className="lp-button" onClick={() => head.snapshot && downloadBackup(head.snapshot, 'nihongo-cloud-before-sync.json')}>下載啟用前雲端備份</button>}
      </div>
      <label className="lp-checkbox"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />我已保存所需備份，並同意合併及上傳此帳戶資料</label>
      <button type="button" className="lp-button primary" disabled={busy || saving || !confirmed || Boolean(summary?.conflicts)} onClick={() => void run(async () => {
        await sync.connect(head); setHead(null); setConfirmed(false);
      })}>合併並啟用自動同步</button>
    </div>}
    {sync.state.conflict?.snapshot && <div className="lp-import-preview">
      <h3>兩邊修改有衝突</h3>
      <p>本機同雲端版本都保留咗，未自動覆蓋。請先下載兩份備份，再逐項選擇設定。卡片及答題歷史衝突仍需人工處理，唔好刪除原始備份。</p>
      <div className="lp-actions">
        <button type="button" className="lp-button" onClick={() => downloadBackup(snapshot, 'nihongo-local-conflict.json')}>下載衝突本機版本</button>
        <button type="button" className="lp-button" onClick={() => sync.state.conflict?.snapshot && downloadBackup(sync.state.conflict.snapshot, 'nihongo-cloud-conflict.json')}>下載衝突雲端版本</button>
      </div>
      <SettingsConflict
        key={`${sync.state.conflict.revision}:${JSON.stringify(snapshot.settings)}:${JSON.stringify(sync.state.head.snapshot?.settings)}`}
        local={snapshot} remote={sync.state.conflict} base={sync.state.head.snapshot}
        disabled={disabled} enabled={sync.state.enabled} resolve={sync.resolve}
      />
    </div>}
    <p className="lp-muted">同步用版本檢查及持久化待傳操作，網絡失敗會重試。同一筆操作重送唔會重複計分。呢個階段未開放刪除雲端紀錄，亦未連結舊 GitHub 帳戶。</p>
  </section>;
}

const settingNames: Record<SettingKey, string> = {
  theme: '顯示主題', level: '學習級別', newPerDay: '每日新卡上限', timeZone: '使用時區',
};
function settingValue(key: SettingKey, value: LearningSnapshot['settings'][SettingKey]) {
  if (value === null) return '全部（含未分級）';
  if (key === 'theme') return value === 'dark' ? '深色' : value === 'light' ? '淺色' : '跟隨系統';
  return String(value);
}

function SettingsConflict({ local, remote, base, disabled, enabled, resolve }: {
  local: LearningSnapshot; remote: CloudHead; base: LearningSnapshot | null;
  disabled: boolean; enabled: boolean;
  resolve: (local: LearningSnapshot, remote: CloudHead, choices: SettingChoices) => Promise<void>;
}) {
  const [choices, setChoices] = useState<SettingChoices>({});
  const [backedUp, setBackedUp] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState({ local, remote });
  const stale = !sameData(preview.local, local) || !sameData(preview.remote, remote);
  const cloud = remote.snapshot;
  if (!cloud) return null;
  const keys = conflictingSettings(base, local, cloud);
  const allLocal: SettingChoices = {};
  for (const key of keys) allLocal[key] = 'local';
  let blocked = '';
  try {
    assertPreservedHistory(cloud, mergeCloud(base, local, cloud, allLocal));
  } catch (cause) {
    blocked = cause instanceof Error ? cause.message : '無法驗證衝突資料，未有套用任何選擇。';
  }
  const apply = async () => {
    setApplying(true); setError('');
    try { await resolve(preview.local, preview.remote, choices); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : '未能套用選擇，原有衝突資料仍然保留。');
      setChoices({}); setBackedUp(false);
    } finally { setApplying(false); }
  };
  return <div>
    <p>衝突雲端版本：{remote.revision}。每項都要明確選擇，唔會預先揀任何一邊。</p>
    {stale && <div role="alert">
      <p>檢視期間資料已改變，請重新檢視最新版本及保存備份，再確認選擇。</p>
      <button type="button" className="lp-button" disabled={disabled || applying} onClick={() => {
        setPreview({ local, remote }); setChoices({}); setBackedUp(false); setError('');
      }}>重新檢視最新版本</button>
    </div>}
    {blocked && <p role="alert" className="lp-error">未能安全合併：{blocked}。請保留雙方備份；卡片或學習歷史衝突需要先另行處理。</p>}
    {keys.map((key) => <label className="lp-field" key={key}>
      {settingNames[key]}：本機 {settingValue(key, local.settings[key])} ／ 雲端 {settingValue(key, cloud.settings[key])}
      <select value={choices[key] ?? ''} disabled={disabled || applying || stale || Boolean(blocked)} onChange={(event) => {
        const value = event.target.value;
        if (value === 'local' || value === 'cloud') setChoices((current) => ({ ...current, [key]: value }));
        else setChoices((current) => { const next = { ...current }; delete next[key]; return next; });
      }}>
        <option value="">請選擇</option>
        <option value="local">採用本機：{settingValue(key, local.settings[key])}</option>
        <option value="cloud">採用雲端：{settingValue(key, cloud.settings[key])}</option>
      </select>
    </label>)}
    {!blocked && <>
      <label className="lp-checkbox"><input type="checkbox" checked={backedUp} disabled={disabled || applying || stale}
        onChange={(event) => setBackedUp(event.target.checked)} />我已保存兩份衝突備份，確認套用以上選擇</label>
      <button type="button" className="lp-button primary" disabled={disabled || applying || stale || !backedUp || keys.some((key) => !choices[key])}
        onClick={() => void apply()}>{applying ? '正在套用選擇' : '確認設定選擇'}</button>
      <p className="lp-muted">{enabled ? '套用後會重新檢查雲端版本再同步；如有新衝突會再次停止。' : '套用後仍然保持暫停，唔會自動啟用同步。'}</p>
    </>}
    {error && <p role="alert" className="lp-error">{error}</p>}
  </div>;
}
