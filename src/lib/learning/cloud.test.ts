import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createCloudStore, learningSchema, CloudConflict, type LearningSql } from './cloud-store';
import { learningRouter } from './cloud-router';
import { authenticateLearning, verifyLearningToken } from './firebase-server';
import { corsHeaders } from '@/lib/hosted-cors';
import { emptySnapshot } from './model';
import { previewItems } from './preview-content';
import { syncOperationSchema } from './sync-model';

const snapshot = () => ({ ...emptySnapshot(), items: structuredClone(previewItems) });
const operation = (baseRevision = 0) => ({ operationId: randomUUID(), baseRevision, snapshot: snapshot() });
const identity = (): DecodedIdToken => ({
  aud: 'test-project', iss: 'https://securetoken.google.com/test-project', uid: 'user-a', sub: 'user-a',
  auth_time: 1, iat: 1, exp: 9999999999, email_verified: true,
  firebase: { sign_in_provider: 'google.com', identities: { 'google.com': ['test-user'] } },
});

test('Firebase verification requests revocation checks and rejects wrong project/provider/unverified email', async () => {
  let revoked = false;
  assert.deepEqual(await verifyLearningToken('test-token', 'test-project', async (_token, check) => {
    revoked = check; return identity();
  }), { projectId: 'test-project', uid: 'user-a' });
  assert.equal(revoked, true);
  for (const claims of [
    { ...identity(), aud: 'other-project' },
    { ...identity(), iss: 'https://example.invalid' },
    { ...identity(), email_verified: false },
    { ...identity(), firebase: { identities: {}, sign_in_provider: 'anonymous' } },
  ]) await assert.rejects(verifyLearningToken('test-token', 'test-project', async () => claims), /learning_identity_invalid/);
  await assert.rejects(verifyLearningToken('revoked-token', 'test-project', async () => { throw new Error('revoked'); }), /revoked/);
});

test('sync request shape rejects client-supplied identity and secret fields', () => {
  const request = operation();
  assert.equal(syncOperationSchema.safeParse(request).success, true);
  assert.equal(syncOperationSchema.safeParse({ ...request, userId: 'other-user' }).success, false);
  assert.equal(syncOperationSchema.safeParse({ ...request, snapshot: { ...request.snapshot, token: 'not-a-token' } }).success, false);
});

test('disabled backend and emulator configuration fail closed before credentials or database access', async (t) => {
  const saved = {
    enabled: process.env.LEARNING_SYNC_ENABLED,
    project: process.env.FIREBASE_PROJECT_ID,
    emulator: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  };
  t.after(() => {
    for (const [key, value] of Object.entries({
      LEARNING_SYNC_ENABLED: saved.enabled, FIREBASE_PROJECT_ID: saved.project, FIREBASE_AUTH_EMULATOR_HOST: saved.emulator,
    })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  process.env.LEARNING_SYNC_ENABLED = 'false';
  await assert.rejects(authenticateLearning('Bearer fixture'), /learning_sync_disabled/);
  process.env.LEARNING_SYNC_ENABLED = 'true';
  process.env.FIREBASE_PROJECT_ID = 'test-project';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9999';
  await assert.rejects(authenticateLearning('Bearer fixture'), /learning_auth_not_configured/);
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  await assert.rejects(authenticateLearning(undefined), /unauthenticated/);
});

test('SQL transactions and protected HTTP API preserve data and isolate identities', async (t) => {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(learningSchema);
  const db: LearningSql = {
    query: (text, values) => pg.query<Record<string, unknown>>(text, values),
    transaction: (work) => pg.transaction((connection) => work({
      query: (text, values) => connection.query<Record<string, unknown>>(text, values),
    })),
  };
  const store = createCloudStore(db);

  await t.test('same uid maps stably; projects and users remain separate', async () => {
    const a = await store.account('test-project', 'a');
    assert.equal(await store.account('test-project', 'a'), a);
    const b = await store.account('test-project', 'b');
    const otherProject = await store.account('different-project', 'a');
    assert.notEqual(a, b); assert.notEqual(a, otherProject);
    await store.write(a, operation());
    assert.equal((await store.read(a)).revision, 1);
    assert.deepEqual(await store.read(b), { revision: 0, snapshot: null });
    assert.deepEqual(await store.read(otherProject), { revision: 0, snapshot: null });
  });

  await t.test('lost-response retries apply exactly once, including after a later revision', async () => {
    const user = await store.account('test-project', 'retry');
    const first = operation();
    assert.deepEqual(await store.write(user, first), { revision: 1 });
    assert.deepEqual(await store.write(user, first), { revision: 1 });
    const second = operation(1);
    second.snapshot.settings.newPerDay = 3;
    await store.write(user, second);
    assert.deepEqual(await store.write(user, first), { revision: 1 });
    assert.equal((await store.read(user)).revision, 2);
    await assert.rejects(store.write(user, { ...first, snapshot: second.snapshot }), /learning_operation_reused/);
    assert.equal((await store.read(user)).snapshot?.settings.newPerDay, 3);
  });

  await t.test('concurrent stale writers conflict rather than overwrite', async () => {
    const user = await store.account('test-project', 'concurrent');
    const outcomes = await Promise.allSettled([store.write(user, operation()), store.write(user, operation())]);
    assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
    const failure = outcomes.find((result) => result.status === 'rejected');
    assert.ok(failure?.status === 'rejected' && failure.reason instanceof CloudConflict);
    assert.equal((await store.read(user)).revision, 1);
  });

  await t.test('transaction failure rolls back snapshot and operation receipt together', async () => {
    const user = await store.account('test-project', 'rollback');
    const failing = createCloudStore({
      ...db,
      transaction: (work) => db.transaction((connection) => work({
        async query(text, values) {
          if (text.startsWith('INSERT INTO learning_sync_operations')) throw new Error('simulated-write-failure');
          return connection.query(text, values);
        },
      })),
    });
    const request = operation();
    await assert.rejects(failing.write(user, request), /simulated-write-failure/);
    assert.deepEqual(await store.read(user), { revision: 0, snapshot: null });
    assert.deepEqual(await store.write(user, request), { revision: 1 });
  });

  await t.test('server refuses removal of saved history while tombstone deletion is not supported', async () => {
    const user = await store.account('test-project', 'history');
    await store.write(user, operation());
    const changed = operation(1);
    changed.snapshot.items = [];
    await assert.rejects(store.write(user, changed), /learning_history_removed/);
    assert.equal((await store.read(user)).snapshot?.items.length, previewItems.length);
  });

  await t.test('HTTP auth runs before database/body parsing; payloads cannot choose another account', async (httpTest) => {
    let storeCalls = 0;
    const app = express();
    app.use(corsHeaders);
    app.use('/api/learning', learningRouter({
      authenticate: async (authorization) => {
        if (authorization !== 'Bearer test-alpha' && authorization !== 'Bearer test-beta') throw new Error('unauthenticated');
        return { projectId: 'test-project', uid: authorization };
      },
      store: async () => { storeCalls += 1; return store; },
    }));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    httpTest.after(() => new Promise<void>((resolve, reject) => {
      server.closeAllConnections();
      server.close((error) => error ? reject(error) : resolve());
    }));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/learning/state`;
    const preflight = await fetch(url, { method: 'OPTIONS', headers: {
      Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type',
    } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /Authorization/);
    assert.equal(storeCalls, 0);
    const unauthorized = await fetch(url, { method: 'PUT', body: 'not-json', headers: { 'Content-Type': 'application/json' } });
    assert.equal(unauthorized.status, 401); assert.equal(storeCalls, 0);
    assert.equal(unauthorized.headers.get('cache-control'), 'no-store');
    const first = operation();
    const put = (body: unknown, token = 'test-alpha') => fetch(url, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal((await put({ ...first, userId: 'forged' })).status, 400);
    const valid = await put(first);
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { revision: 1 });
    const beta = await fetch(url, { headers: { Authorization: 'Bearer test-beta' } });
    assert.deepEqual(await beta.json(), { revision: 0, snapshot: null });
    const conflict = await put(operation());
    assert.equal(conflict.status, 409);
    const body = await conflict.json();
    assert.equal(body.code, 'learning_conflict');
    assert.equal(body.head.revision, 1);
    const badJson = await fetch(url, {
      method: 'PUT', headers: { Authorization: 'Bearer test-alpha', 'Content-Type': 'application/json' }, body: '{',
    });
    assert.equal(badJson.status, 400);
    assert.doesNotMatch(await badJson.text(), /SyntaxError|stack|test-alpha/);
  });
});
