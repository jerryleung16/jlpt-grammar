import { openDB, type DBSchema } from 'idb';
import { emptySnapshot, parseSnapshot, type LearningSnapshot } from './model';
import type { LearningScope } from './identity';
import { mergeImport } from './migration';
import { assertPreservedHistory, cloudHeadSchema, initialSyncState, mergeCloud, sameData, SyncConflict, syncStateSchema, type CloudHead, type SettingChoices, type SyncState } from './sync-model';

interface LearningDatabase extends DBSchema {
  snapshots: { key: string; value: LearningSnapshot };
  sync: { key: string; value: SyncState };
}
export const learningEvent = 'learning-preview-updated';
const database = () => openDB<LearningDatabase>('nihongo-learning-preview', 2, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots');
    if (!db.objectStoreNames.contains('sync')) db.createObjectStore('sync');
  },
  blocking(_current, _blocked, event) {
    (event.target as IDBDatabase).close();
  },
});

function queueUpload(snapshot: LearningSnapshot, state: SyncState): SyncState {
  if (!state.enabled || state.outbox || state.conflict || sameData(snapshot, state.head.snapshot)) return state;
  return { ...state, outbox: { operationId: crypto.randomUUID(), baseRevision: state.head.revision, snapshot } };
}

export async function loadLearning(scope: LearningScope = 'guest'): Promise<LearningSnapshot> {
  const db = await database();
  try {
    const saved = await db.get('snapshots', scope);
    return saved ? parseSnapshot(saved) : emptySnapshot(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } finally { db.close(); }
}

export async function updateLearning(update: (current: LearningSnapshot) => LearningSnapshot, scope: LearningScope = 'guest') {
  const db = await database();
  try {
    const tx = db.transaction(['snapshots', 'sync'], 'readwrite');
    const snapshots = tx.objectStore('snapshots');
    const current = await snapshots.get(scope);
    let next: LearningSnapshot;
    try {
      next = parseSnapshot(update(current ? parseSnapshot(current) : emptySnapshot(Intl.DateTimeFormat().resolvedOptions().timeZone)));
      const state = syncStateSchema.parse(await tx.objectStore('sync').get(scope) ?? initialSyncState());
      await snapshots.put(next, scope);
      if (scope !== 'guest') await tx.objectStore('sync').put(queueUpload(next, state), scope);
      await tx.done;
    } catch (error) {
      try { tx.abort(); } catch { /* A failed transaction may already be aborted. */ }
      await tx.done.catch(() => undefined);
      throw error;
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(learningEvent));
    return next;
  } finally { db.close(); }
}

export async function loadSync(scope: LearningScope): Promise<SyncState> {
  const db = await database();
  try { return syncStateSchema.parse(await db.get('sync', scope) ?? initialSyncState()); }
  finally { db.close(); }
}

async function changeSync(
  scope: LearningScope,
  change: (snapshot: LearningSnapshot, state: SyncState) => { snapshot: LearningSnapshot; state: SyncState },
) {
  if (scope === 'guest') throw new Error('訪客資料唔可以自動上傳。請先登入並預覽匯入。');
  const db = await database();
  try {
    const tx = db.transaction(['snapshots', 'sync'], 'readwrite');
    try {
      const snapshot = parseSnapshot(await tx.objectStore('snapshots').get(scope) ?? emptySnapshot());
      const state = syncStateSchema.parse(await tx.objectStore('sync').get(scope) ?? initialSyncState());
      const result = change(snapshot, state);
      const next = parseSnapshot(result.snapshot);
      const nextState = syncStateSchema.parse(result.state);
      await tx.objectStore('snapshots').put(next, scope);
      await tx.objectStore('sync').put(nextState, scope);
      await tx.done;
      if (!sameData(snapshot, next) && typeof window !== 'undefined') window.dispatchEvent(new Event(learningEvent));
      return nextState;
    } catch (cause) {
      try { tx.abort(); } catch { /* The transaction may already have completed or aborted. */ }
      await tx.done.catch(() => undefined);
      throw cause;
    }
  } finally { db.close(); }
}

export function connectSync(scope: LearningScope, remote: CloudHead) {
  const head = cloudHeadSchema.parse(remote);
  return changeSync(scope, (snapshot, previous) => {
    if (previous.enabled || previous.outbox || previous.head.revision) throw new Error('同步已初始化，請使用重試或繼續同步。');
    const merged = head.snapshot ? mergeImport(snapshot, head.snapshot) : snapshot;
    return { snapshot: merged, state: queueUpload(merged, { enabled: true, head, outbox: null, conflict: null }) };
  });
}

export function setSyncEnabled(scope: LearningScope, enabled: boolean) {
  return changeSync(scope, (snapshot, state) => ({
    snapshot, state: queueUpload(snapshot, { ...state, enabled }),
  }));
}

export function prepareSync(scope: LearningScope) {
  return changeSync(scope, (snapshot, state) => ({ snapshot, state: queueUpload(snapshot, state) }));
}

export function acceptSync(scope: LearningScope, operationId: string, revision: number) {
  return changeSync(scope, (snapshot, state) => {
    if (state.outbox?.operationId !== operationId) return { snapshot, state };
    if (revision !== state.outbox.baseRevision + 1) throw new Error('伺服器回覆版本不一致；待傳資料仍然保留。');
    return { snapshot, state: queueUpload(snapshot, {
      ...state, head: { revision, snapshot: state.outbox.snapshot }, outbox: null, conflict: null,
    }) };
  });
}

export function reconcileSync(scope: LearningScope, remote: CloudHead, rejectedOperationId?: string) {
  const head = cloudHeadSchema.parse(remote);
  return changeSync(scope, (snapshot, previous) => {
    const state = previous.outbox?.operationId === rejectedOperationId ? { ...previous, outbox: null } : previous;
    if (state.outbox) return { snapshot, state };
    if (head.revision < state.head.revision ||
      (head.revision === state.head.revision && !sameData(head.snapshot, state.head.snapshot))) {
      throw new Error('雲端版本倒退或不一致；同步已停止，請保留本機備份並聯絡管理員。');
    }
    try {
      const merged = head.snapshot ? mergeCloud(state.head.snapshot, snapshot, head.snapshot) : snapshot;
      return { snapshot: merged, state: queueUpload(merged, { ...state, head, conflict: null }) };
    } catch (cause) {
      if (!(cause instanceof SyncConflict)) throw cause;
      return { snapshot, state: { ...state, conflict: head } };
    }
  });
}

export function resolveSettingsConflict(
  scope: LearningScope,
  expectedLocal: LearningSnapshot,
  expectedRemote: CloudHead,
  choices: SettingChoices,
) {
  const local = parseSnapshot(expectedLocal);
  const remote = cloudHeadSchema.parse(expectedRemote);
  return changeSync(scope, (snapshot, state) => {
    if (!state.conflict?.snapshot || state.outbox ||
      !sameData(snapshot, local) || !sameData(state.conflict, remote)) {
      throw new Error('本機或雲端衝突版本已改變，請重新檢視並選擇，未有套用舊選擇。');
    }
    const merged = mergeCloud(state.head.snapshot, snapshot, state.conflict.snapshot, choices);
    assertPreservedHistory(state.conflict.snapshot, merged);
    return {
      snapshot: merged,
      state: queueUpload(merged, { ...state, head: state.conflict, conflict: null }),
    };
  });
}

export function downloadBackup(snapshot: LearningSnapshot, name = 'nihongo-backup.json') {
  const blob = new Blob([JSON.stringify(parseSnapshot(snapshot), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
