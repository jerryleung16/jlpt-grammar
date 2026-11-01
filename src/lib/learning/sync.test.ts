import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountScope } from './identity';
import { emptySnapshot, type LearningSnapshot } from './model';
import { previewItems, previewQuestions } from './preview-content';
import { answerQuiz, createQuiz } from './quiz';
import { assertPreservedHistory, conflictingSettings, hasPendingChanges, initialSyncState, mergeCloud, sameData, syncInitialized, syncStatus, SyncConflict, type CloudHead, type SyncOperation } from './sync-model';
import { acceptSync, connectSync, loadLearning, loadSync, prepareSync, reconcileSync, resolveSettingsConflict, setSyncEnabled, updateLearning } from './store';
import { createSyncTransport, RemoteConflict, SyncRequestError, syncOnce, type SyncTransport } from './sync-client';

const snapshot = (): LearningSnapshot => ({ ...emptySnapshot(), items: structuredClone(previewItems) });
const scope = (name: string) => accountScope('sync-test-project', name);
const noCloud: CloudHead = { revision: 0, snapshot: null };

function remote() {
  let head: CloudHead = structuredClone(noCloud);
  const receipts = new Map<string, number>();
  const transport: SyncTransport = {
    async read() { return structuredClone(head); },
    async write(operation: SyncOperation) {
      const applied = receipts.get(operation.operationId);
      if (applied !== undefined) return { revision: applied };
      if (head.revision !== operation.baseRevision) throw new RemoteConflict(structuredClone(head));
      assertPreservedHistory(head.snapshot, operation.snapshot);
      head = { revision: head.revision + 1, snapshot: structuredClone(operation.snapshot) };
      receipts.set(operation.operationId, head.revision);
      return { revision: head.revision };
    },
  };
  return transport;
}

test('three-way merge preserves independent edits, reviews and chronological attempt ordering', () => {
  const base = snapshot(), local = structuredClone(base), cloud = structuredClone(base);
  local.items[0].label = 'easy'; cloud.items[1].label = 'difficult';
  local.settings.theme = 'dark'; cloud.settings.newPerDay = 7;
  local.reviews = [{ id: 'a-later', itemId: base.items[0].id, rating: 3, at: '2026-11-02T00:00:00.000Z', undone: false }];
  cloud.reviews = [{ id: 'z-earlier', itemId: base.items[1].id, rating: 2, at: '2026-11-01T00:00:00.000Z', undone: false }];
  local.attempts = [createQuiz(previewQuestions, 1, 'a-later', new Date('2026-11-02T00:00:00.000Z'))];
  cloud.attempts = [createQuiz(previewQuestions, 1, 'z-earlier', new Date('2026-11-01T00:00:00.000Z'))];
  const result = mergeCloud(base, local, cloud);
  assert.equal(result.items.find((item) => item.id === base.items[0].id)?.label, 'easy');
  assert.equal(result.items.find((item) => item.id === base.items[1].id)?.label, 'difficult');
  assert.equal(result.settings.theme, 'dark'); assert.equal(result.settings.newPerDay, 7);
  assert.deepEqual(result.reviews.map((event) => event.id), ['z-earlier', 'a-later']);
  assert.deepEqual(result.attempts.map((attempt) => attempt.id), ['z-earlier', 'a-later']);
});

test('simultaneous conflicting edits do not choose a winner or mutate either source', () => {
  const base = snapshot(), local = structuredClone(base), cloud = structuredClone(base);
  local.items[0].meaning = 'local'; cloud.items[0].meaning = 'cloud';
  assert.throws(() => mergeCloud(base, local, cloud), SyncConflict);
  assert.equal(local.items[0].meaning, 'local'); assert.equal(cloud.items[0].meaning, 'cloud');
});

test('existing review scores and quiz answers cannot be rewritten or erased', () => {
  const before = snapshot();
  before.reviews = [{ id: 'review', itemId: before.items[0].id, rating: 3, at: '2026-11-01T00:00:00.000Z', undone: false }];
  before.attempts = [answerQuiz(createQuiz(previewQuestions, 2, 'quiz', new Date('2026-11-01T00:00:00.000Z')), 0, 0)];
  const after = structuredClone(before);
  after.reviews[0].rating = 4;
  assert.throws(() => assertPreservedHistory(before, after), /learning_history_changed/);
  after.reviews = [{ ...before.reviews[0], undone: true }];
  after.attempts[0] = answerQuiz(before.attempts[0], 1, 1);
  assert.doesNotThrow(() => assertPreservedHistory(before, after));
  after.attempts[0].answers[0] = 2;
  assert.throws(() => assertPreservedHistory(before, after), /learning_history_changed/);
});

test('offline edits save outbox atomically and later edits survive an earlier acknowledgement', async () => {
  const account = scope('offline');
  await updateLearning(() => snapshot(), account);
  await connectSync(account, noCloud);
  const first = (await loadSync(account)).outbox!;
  await updateLearning((current) => ({ ...current, settings: { ...current.settings, newPerDay: 4 } }), account);
  assert.deepEqual((await loadSync(account)).outbox, first);
  const next = await acceptSync(account, first.operationId, 1);
  assert.ok(next.outbox);
  assert.notEqual(next.outbox.operationId, first.operationId);
  assert.equal(next.outbox.baseRevision, 1);
  assert.equal(next.outbox.snapshot.settings.newPerDay, 4);
  assert.equal((await loadLearning(account)).settings.newPerDay, 4);
  await acceptSync(account, first.operationId, 1);
  assert.deepEqual((await loadSync(account)).outbox, next.outbox);
});

test('response loss retains operation id and retry does not upload twice', async () => {
  const account = scope('lost-response'), server = remote();
  await updateLearning(() => snapshot(), account); await connectSync(account, noCloud);
  const id = (await loadSync(account)).outbox!.operationId;
  await assert.rejects(syncOnce(account, {
    ...server, async write(operation) { await server.write(operation); throw new Error('response-lost'); },
  }), /response-lost/);
  assert.equal((await loadSync(account)).outbox?.operationId, id);
  assert.equal((await server.read()).revision, 1);
  assert.equal((await syncOnce(account, server)).outbox, null);
  assert.equal((await server.read()).revision, 1);
});

test('two offline devices merge independent work rather than replace cloud data', async () => {
  const a = scope('device-a'), b = scope('device-b'), server = remote();
  await updateLearning(() => snapshot(), a);
  await connectSync(a, noCloud); await syncOnce(a, server);
  await connectSync(b, await server.read()); await syncOnce(b, server);
  await updateLearning((current) => ({ ...current, items: current.items.map((item) => item.id === previewItems[0].id ? { ...item, label: 'easy' } : item) }), a);
  await updateLearning((current) => ({ ...current, items: current.items.map((item) => item.id === previewItems[1].id ? { ...item, label: 'difficult' } : item) }), b);
  await syncOnce(a, server); await syncOnce(b, server); await syncOnce(a, server);
  assert.ok(sameData((await server.read()).snapshot, await loadLearning(a)));
  assert.equal((await loadLearning(a)).items.find((item) => item.id === previewItems[0].id)?.label, 'easy');
  assert.equal((await loadLearning(a)).items.find((item) => item.id === previewItems[1].id)?.label, 'difficult');
});

test('conflicts survive reload, retain both versions, and can be resolved without losing other data', async () => {
  const account = scope('conflict'), base = snapshot();
  await updateLearning(() => base, account); await connectSync(account, { revision: 1, snapshot: base });
  await updateLearning((current) => ({ ...current, items: current.items.map((item, index) => index === 0 ? { ...item, meaning: 'local' } : item) }), account);
  const pending = (await loadSync(account)).outbox!;
  const cloud = structuredClone(base); cloud.items[0].meaning = 'remote';
  const head = { revision: 2, snapshot: cloud };
  await reconcileSync(account, head, pending.operationId);
  assert.deepEqual((await loadSync(account)).conflict, head);
  assert.equal((await loadLearning(account)).items[0].meaning, 'local');
  assert.equal((await prepareSync(account)).outbox, null);
  await updateLearning((current) => ({ ...current, items: current.items.map((item) => item.id === cloud.items[0].id ? { ...item, meaning: 'remote' } : item) }), account);
  assert.equal((await reconcileSync(account, head)).conflict, null);
});

test('pause retains pending work; guest upload, cloud rollback and invalid receipts are rejected', async () => {
  const account = scope('pause');
  await connectSync(account, noCloud);
  const pending = (await loadSync(account)).outbox!;
  await setSyncEnabled(account, false);
  await syncOnce(account, { read: async () => { throw new Error('must-not-read'); }, write: async () => { throw new Error('must-not-write'); } });
  assert.equal((await loadSync(account)).outbox?.operationId, pending.operationId);
  await assert.rejects(connectSync('guest', noCloud), /訪客/);
  await assert.rejects(acceptSync(account, pending.operationId, 99), /版本不一致/);
  await acceptSync(account, pending.operationId, 1);
  await assert.rejects(reconcileSync(account, noCloud), /版本倒退/);
  assert.equal((await loadSync(account)).head.revision, 1);
});

test('sync transport refuses nonlocal HTTP and credential-bearing URLs', () => {
  const token = async () => 'test-only';
  assert.throws(() => createSyncTransport('http://example.com', token), /HTTPS/);
  assert.throws(() => createSyncTransport('https://user:password@example.com', token), /憑證/);
  assert.throws(() => createSyncTransport('https://example.com?key=value', token), /憑證/);
  assert.doesNotThrow(() => createSyncTransport('http://127.0.0.1:1234', token));
});

test('sync status distinguishes never connected, paused clean, paused dirty, pending and conflict', async () => {
  const initial = initialSyncState();
  assert.equal(syncInitialized(initial), false);
  assert.match(syncStatus(initial), /尚未啟用/);
  assert.equal(hasPendingChanges(snapshot(), initial), false);
  const account = scope('status');
  await updateLearning(() => snapshot(), account);
  await connectSync(account, noCloud);
  const queued = await loadSync(account);
  assert.equal(syncStatus(queued), '等待上傳');
  await setSyncEnabled(account, false);
  assert.match(syncStatus(await loadSync(account)), /已暫停/);
  assert.equal(hasPendingChanges(await loadLearning(account), await loadSync(account)), true);
  await acceptSync(account, queued.outbox!.operationId, 1);
  assert.equal(hasPendingChanges(await loadLearning(account), await loadSync(account)), false);
  await updateLearning((current) => ({ ...current, settings: { ...current.settings, newPerDay: 17 } }), account);
  assert.equal((await loadSync(account)).outbox, null);
  assert.equal(hasPendingChanges(await loadLearning(account), await loadSync(account)), true);
  assert.equal(syncStatus({ ...queued, conflict: { revision: 1, snapshot: snapshot() } }), '需要處理衝突');
});

async function settingConflict(name: string) {
  const account = scope(name), base = snapshot();
  await updateLearning(() => base, account);
  await connectSync(account, { revision: 1, snapshot: base });
  await updateLearning((current) => ({
    ...current, settings: { ...current.settings, newPerDay: 14, theme: 'dark' },
    reviews: [{ id: `${name}-local`, itemId: current.items[0].id, rating: 3, at: '2026-11-01T00:00:00.000Z', undone: false }],
  }), account);
  const cloud = structuredClone(base);
  cloud.settings.newPerDay = 15; cloud.settings.theme = 'light';
  cloud.reviews = [{ id: `${name}-cloud`, itemId: cloud.items[1].id, rating: 2, at: '2026-11-01T01:00:00.000Z', undone: false }];
  const head = { revision: 2, snapshot: cloud };
  await reconcileSync(account, head, (await loadSync(account)).outbox!.operationId);
  return { account, base, head, local: await loadLearning(account) };
}

test('explicit per-setting choices preserve independent history and survive a reload before upload', async () => {
  const { account, base, head, local } = await settingConflict('choices');
  assert.deepEqual(conflictingSettings(base, local, head.snapshot), ['theme', 'newPerDay']);
  const result = await resolveSettingsConflict(account, local, head, { theme: 'cloud', newPerDay: 'local' });
  assert.equal(result.conflict, null);
  assert.equal(result.head.revision, 2);
  assert.equal(result.outbox?.baseRevision, 2);
  const saved = await loadLearning(account);
  assert.equal(saved.settings.theme, 'light');
  assert.equal(saved.settings.newPerDay, 14);
  assert.equal(saved.reviews.length, 2);
  assert.equal(saved.items.length, base.items.length);
  assert.deepEqual((await loadSync(account)).outbox, result.outbox);
  await syncOnce(account, {
    read: async () => head,
    write: async (operation) => { assert.deepEqual(operation.snapshot, saved); return { revision: 3 }; },
  });
  assert.equal((await loadSync(account)).outbox, null);
});

test('settings resolution requires all conflicting choices and never partially commits', async () => {
  const { account, head, local } = await settingConflict('incomplete');
  const before = await loadSync(account);
  await assert.rejects(resolveSettingsConflict(account, local, head, { theme: 'local' }), SyncConflict);
  assert.deepEqual(await loadSync(account), before);
  assert.deepEqual(await loadLearning(account), local);
});

test('level and timezone choices resolve only genuine conflicts, not independent settings', () => {
  const base = snapshot(), local = structuredClone(base), cloud = structuredClone(base);
  local.settings.level = 'N4'; cloud.settings.level = null;
  local.settings.timeZone = 'Asia/Tokyo'; cloud.settings.timeZone = 'Europe/London';
  cloud.settings.newPerDay = 7;
  assert.deepEqual(conflictingSettings(base, local, cloud), ['level', 'timeZone']);
  const merged = mergeCloud(base, local, cloud, { level: 'cloud', timeZone: 'local', newPerDay: 'local' });
  assert.equal(merged.settings.level, null);
  assert.equal(merged.settings.timeZone, 'Asia/Tokyo');
  assert.equal(merged.settings.newPerDay, 7);
});

test('settings resolution cannot rewrite cloud review history even without a record merge conflict', async () => {
  const account = scope('immutable-choice'), base = snapshot();
  base.reviews = [{ id: 'existing', itemId: base.items[0].id, rating: 3, at: '2026-11-01T00:00:00.000Z', undone: false }];
  await updateLearning(() => base, account);
  await connectSync(account, { revision: 1, snapshot: base });
  await updateLearning((current) => ({ ...current, settings: { ...current.settings, newPerDay: 14 },
    reviews: current.reviews.map((event) => ({ ...event, rating: 4 })) }), account);
  const cloud = structuredClone(base); cloud.settings.newPerDay = 15;
  const head = { revision: 2, snapshot: cloud };
  await reconcileSync(account, head, (await loadSync(account)).outbox!.operationId);
  const local = await loadLearning(account), before = await loadSync(account);
  await assert.rejects(resolveSettingsConflict(account, local, head, { newPerDay: 'local' }), /learning_history_changed/);
  assert.deepEqual(await loadSync(account), before);
  assert.deepEqual(await loadLearning(account), local);
});

test('stale local or remote previews cannot apply old settings choices', async () => {
  const { account, head, local } = await settingConflict('stale');
  const choices = { theme: 'cloud', newPerDay: 'local' } as const;
  await updateLearning((current) => ({ ...current, settings: { ...current.settings, level: 'N4' } }), account);
  await assert.rejects(resolveSettingsConflict(account, local, head, choices), /版本已改變/);
  const current = await loadLearning(account);
  await reconcileSync(account, { ...head, revision: 3 });
  await assert.rejects(resolveSettingsConflict(account, current, head, choices), /版本已改變/);
  assert.deepEqual(await loadLearning(account), current);
});

test('settings choices cannot bypass card conflicts or turn paused sync back on', async () => {
  const { account, head, local } = await settingConflict('blocked');
  await updateLearning((current) => ({ ...current, items: current.items.map((item, index) =>
    index === 0 ? { ...item, meaning: 'local change' } : item) }), account);
  const cloud = structuredClone(head);
  cloud.snapshot.items[0].meaning = 'cloud change';
  await reconcileSync(account, { ...cloud, revision: 3 });
  const before = await loadSync(account), current = await loadLearning(account);
  await assert.rejects(resolveSettingsConflict(account, current, before.conflict!, { theme: 'local', newPerDay: 'cloud' }), SyncConflict);
  assert.deepEqual(await loadSync(account), before);
  assert.deepEqual(await loadLearning(account), current);

  const paused = await settingConflict('paused-choice');
  await setSyncEnabled(paused.account, false);
  const result = await resolveSettingsConflict(paused.account, paused.local, paused.head, { theme: 'cloud', newPerDay: 'cloud' });
  assert.equal(result.enabled, false);
  assert.equal(result.outbox, null);
  assert.equal(result.conflict, null);
  assert.equal(hasPendingChanges(await loadLearning(paused.account), result), true);
  assert.equal((await loadLearning(account)).reviews.length, local.reviews.length);
});

test('a newer server conflict after resolution preserves the chosen local value', async () => {
  const { account, head, local } = await settingConflict('new-remote');
  await resolveSettingsConflict(account, local, head, { theme: 'cloud', newPerDay: 'local' });
  const newer = structuredClone(head);
  newer.revision = 3; newer.snapshot.settings.newPerDay = 16;
  await syncOnce(account, { read: async () => newer, write: async () => { throw new RemoteConflict(newer); } });
  assert.equal((await loadSync(account)).conflict?.revision, 3);
  assert.equal((await loadLearning(account)).settings.newPerDay, 14);
  assert.equal((await loadSync(account)).outbox, null);
});

test('transport binds bearer credentials to the configured endpoint and never follows redirects', async (t) => {
  let requests = 0;
  const request: SyncOperation = { operationId: crypto.randomUUID(), baseRevision: 0, snapshot: snapshot() };
  t.mock.method(globalThis, 'fetch', async (input: string, init: RequestInit) => {
    requests += 1;
    assert.equal(input, 'https://example.test/api/learning/state');
    assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.cache, 'no-store');
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer test-only-token');
    assert.deepEqual(JSON.parse(String(init.body)), request);
    return new Response(JSON.stringify({ revision: 1 }), { headers: { 'Content-Type': 'application/json' } });
  });
  assert.deepEqual(await createSyncTransport('https://example.test', async () => 'test-only-token').write(request), { revision: 1 });
  assert.equal(requests, 1);
  await assert.rejects(createSyncTransport('https://example.test', async () => { throw new Error('account-changed'); }).read(), /account-changed/);
  assert.equal(requests, 1);
});

test('401 failures retain the outbox and require user action instead of automatic HTTP retries', async (t) => {
  const account = scope('401');
  await connectSync(account, noCloud);
  const pending = (await loadSync(account)).outbox;
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: '重新登入' }), {
    status: 401, headers: { 'Content-Type': 'application/json' },
  }));
  await assert.rejects(syncOnce(account, createSyncTransport('https://example.test', async () => 'fixture')), (cause: unknown) =>
    cause instanceof SyncRequestError && cause.status === 401 && !cause.retryable);
  assert.deepEqual((await loadSync(account)).outbox, pending);
});
