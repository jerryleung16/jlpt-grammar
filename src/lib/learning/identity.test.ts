import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountScope, parseFirebaseConfig, signInError } from './identity';
import { loadLearning, updateLearning } from './store';
import { previewItems } from './preview-content';
import { mergeImport } from './migration';

test('Firebase config is optional only when all four fields are absent', () => {
  assert.equal(parseFirebaseConfig({}), null);
  assert.equal(parseFirebaseConfig({ apiKey: '', projectId: ' ' }), null);
  assert.throws(() => parseFirebaseConfig({ projectId: 'test-project' }), /未完整/);
  const config = { apiKey: 'public-test-key', projectId: 'test-project', authDomain: 'test-project.firebaseapp.com', appId: 'test-app' };
  assert.deepEqual(parseFirebaseConfig(config), config);
  assert.throws(() => parseFirebaseConfig({ ...config, authDomain: 'https://test-project.firebaseapp.com/path' }));
});

test('account partition keys include project and uid without delimiter collisions', () => {
  assert.notEqual(accountScope('test-project', 'a:b'), accountScope('test-project:a', 'b'));
  assert.notEqual(accountScope('project-one', 'same-user'), accountScope('project-two', 'same-user'));
  assert.throws(() => accountScope('', 'user'));
  assert.throws(() => accountScope('test-project', ''));
});

test('guest and two account partitions keep independent cards and settings', async () => {
  const a = accountScope('test-project', 'user-a');
  const b = accountScope('test-project', 'user-b');
  await updateLearning((current) => ({ ...current, items: [{ ...previewItems[0], id: 'guest-card' }] }));
  await updateLearning((current) => ({ ...current, items: [{ ...previewItems[1], id: 'a-card' }] }), a);
  await updateLearning((current) => ({ ...current, items: [{ ...previewItems[2], id: 'b-card' }] }), b);
  await updateLearning((current) => ({ ...current, settings: { ...current.settings, theme: 'dark' } }), a);
  assert.equal((await loadLearning()).items[0].id, 'guest-card');
  assert.equal((await loadLearning(a)).items[0].id, 'a-card');
  assert.equal((await loadLearning(b)).items[0].id, 'b-card');
  assert.equal((await loadLearning(a)).settings.theme, 'dark');
  assert.equal((await loadLearning(b)).settings.theme, 'system');
  assert.equal((await loadLearning(accountScope('test-project', 'new-user'))).items.length, 0);
});

test('in-flight writes stay bound to the captured account rather than the next active account', async () => {
  const a = accountScope('test-project', 'race-a');
  const b = accountScope('test-project', 'race-b');
  await Promise.all([
    updateLearning((current) => ({ ...current, items: [{ ...previewItems[0], id: 'only-a' }] }), a),
    updateLearning((current) => ({ ...current, items: [{ ...previewItems[1], id: 'only-b' }] }), b),
    updateLearning((current) => ({ ...current, settings: { ...current.settings, newPerDay: 3 } }), a),
  ]);
  assert.equal((await loadLearning(a)).items[0].id, 'only-a');
  assert.equal((await loadLearning(a)).settings.newPerDay, 3);
  assert.equal((await loadLearning(b)).items[0].id, 'only-b');
  assert.equal((await loadLearning(b)).settings.newPerDay, 10);
});

test('guest import requires an explicit scoped write and leaves original guest data intact', async () => {
  const scope = accountScope('test-project', 'import-user');
  const guest = await loadLearning();
  assert.equal((await loadLearning(scope)).items.length, 0);
  await updateLearning((current) => mergeImport(current, guest), scope);
  assert.deepEqual((await loadLearning(scope)).items, guest.items);
  assert.deepEqual(await loadLearning(), guest);
  await updateLearning((current) => ({ ...current, items: [] }), scope);
  assert.deepEqual(await loadLearning(), guest);
});

test('actionable auth errors never echo raw tokens, credentials or provider details', () => {
  assert.match(signInError({ code: 'auth/popup-blocked' }), /封鎖/);
  assert.match(signInError({ code: 'auth/unauthorized-domain' }), /網域/);
  assert.match(signInError({ code: 'auth/network-request-failed' }), /網絡/);
  assert.match(signInError({ code: 'auth/popup-closed-by-user' }), /未完成登入/);
  const message = signInError({ code: 'auth/unknown', message: 'SECRET-CREDENTIAL', customData: { email: 'private' } });
  assert.doesNotMatch(message, /SECRET-CREDENTIAL|private/);
});
