import { z } from 'zod';
import { parseSnapshot, type LearningSnapshot } from './model';

const revision = z.number().int().min(0).max(2147483646);
const validatedSnapshot = z.unknown().transform((value, context) => {
  try { return parseSnapshot(value); }
  catch { context.addIssue({ code: 'custom', message: '學習資料格式無效或超出大小限制。' }); return z.NEVER; }
});
export const cloudHeadSchema = z.object({
  revision,
  snapshot: validatedSnapshot.nullable(),
}).strict().refine((value) => (value.revision === 0) === (value.snapshot === null));
export type CloudHead = z.infer<typeof cloudHeadSchema>;
export const syncOperationSchema = z.object({
  operationId: z.string().uuid(),
  baseRevision: revision,
  snapshot: validatedSnapshot,
}).strict();
export type SyncOperation = z.infer<typeof syncOperationSchema>;
export const syncReceiptSchema = z.object({ revision: revision.min(1) }).strict();
export const syncStateSchema = z.object({
  enabled: z.boolean(),
  head: cloudHeadSchema,
  outbox: syncOperationSchema.nullable(),
  conflict: cloudHeadSchema.nullable(),
}).strict();
export type SyncState = z.infer<typeof syncStateSchema>;
export const initialSyncState = (): SyncState => ({
  enabled: false, head: { revision: 0, snapshot: null }, outbox: null, conflict: null,
});
export const sameData = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export const syncInitialized = (state: SyncState) =>
  state.enabled || state.head.revision > 0 || state.outbox !== null || state.conflict !== null;

export function syncStatus(state: SyncState) {
  if (!state.enabled) return syncInitialized(state) ? '自動同步已暫停 · 修改只存喺本機' : '僅本機 · 尚未啟用同步';
  return state.conflict ? '需要處理衝突' : state.outbox ? '等待上傳' : '已同步';
}

export const hasPendingChanges = (snapshot: LearningSnapshot, state: SyncState) =>
  syncInitialized(state) && (state.outbox !== null || !sameData(snapshot, state.head.snapshot));

export const settingKeys = ['theme', 'level', 'newPerDay', 'timeZone'] as const;
export type SettingKey = typeof settingKeys[number];
export type SettingChoices = Partial<Record<SettingKey, 'local' | 'cloud'>>;

export function conflictingSettings(base: LearningSnapshot | null, local: LearningSnapshot, remote: LearningSnapshot) {
  return settingKeys.filter((key) => !sameData(local.settings[key], remote.settings[key]) &&
    (!base || (!sameData(base.settings[key], local.settings[key]) && !sameData(base.settings[key], remote.settings[key]))));
}

export class SyncConflict extends Error {
  constructor(public readonly entries: string[]) {
    super(`兩邊都有不同修改，需要先處理衝突：${entries.slice(0, 5).join('、')}`);
  }
}

export function mergeCloud(base: LearningSnapshot | null, local: LearningSnapshot, remote: LearningSnapshot, choices: SettingChoices = {}): LearningSnapshot {
  const conflicts: string[] = [];
  function records<T extends { id: string }>(kind: string, before: T[], ours: T[], theirs: T[]): T[] {
    const b = new Map(before.map((value) => [value.id, value]));
    const l = new Map(ours.map((value) => [value.id, value]));
    const r = new Map(theirs.map((value) => [value.id, value]));
    return [...new Set([...l.keys(), ...r.keys()])].sort().flatMap((id) => {
      const old = b.get(id), left = l.get(id), right = r.get(id);
      if (!left) return right ? [right] : [];
      if (!right || sameData(left, right) || sameData(old, right)) return [left];
      if (sameData(old, left)) return [right];
      conflicts.push(`${kind}:${id}`);
      return [];
    });
  }
  const settings = { ...local.settings };
  for (const key of settingKeys) {
    const before = base?.settings[key], left = local.settings[key], right = remote.settings[key];
    if (sameData(left, right) || sameData(before, right)) continue;
    if (!base || !sameData(before, left)) {
      if (choices[key] === 'cloud') Object.assign(settings, { [key]: right });
      else if (choices[key] !== 'local') conflicts.push(`設定:${key}`);
      continue;
    }
    Object.assign(settings, { [key]: right });
  }
  const result = {
    ...local,
    items: records('卡片', base?.items ?? [], local.items, remote.items),
    reviews: records('複習', base?.reviews ?? [], local.reviews, remote.reviews)
      .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)),
    attempts: records('測驗', base?.attempts ?? [], local.attempts, remote.attempts)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id)),
    settings,
  };
  if (conflicts.length) throw new SyncConflict(conflicts);
  return parseSnapshot(result);
}

export function assertPreservedHistory(before: LearningSnapshot | null, after: LearningSnapshot) {
  if (!before) return;
  for (const key of ['items', 'reviews', 'attempts'] as const) {
    const ids = new Set(after[key].map((record) => record.id));
    if (before[key].some((record) => !ids.has(record.id))) throw new Error('learning_history_removed');
  }
  const reviews = new Map(after.reviews.map((event) => [event.id, event]));
  for (const old of before.reviews) {
    const next = reviews.get(old.id)!;
    if (!sameData({ ...old, undone: false }, { ...next, undone: false }) || (old.undone && !next.undone)) {
      throw new Error('learning_history_changed');
    }
  }
  const attempts = new Map(after.attempts.map((attempt) => [attempt.id, attempt]));
  for (const old of before.attempts) {
    const next = attempts.get(old.id)!;
    if (!sameData({ ...old, answers: [] }, { ...next, answers: [] }) ||
      !sameData(old.answers, next.answers.slice(0, old.answers.length))) throw new Error('learning_history_changed');
  }
}
