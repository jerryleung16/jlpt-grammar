import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';

test('isolated release redirects to learning and blocks legacy APIs without changing legacy mode', async () => {
  Object.assign(process.env, { NODE_ENV: 'test' });
  process.env.DATABASE_URL = '';
  process.env.LEARNING_ONLY = 'true';
  process.env.LEARNING_SYNC_ENABLED = 'false';
  const { createServer } = await import('../../../server/index');
  const app = await createServer();
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const path of ['/', '/jlpt-grammar', '/jlpt-grammar/']) {
      const response = await fetch(origin + path, { redirect: 'manual' });
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/jlpt-grammar/preview/');
    }
    for (const prefix of ['/api', '/jlpt-grammar/api']) {
      const health = await fetch(`${origin}${prefix}/health`);
      assert.equal(health.status, 503);
      assert.deepEqual(await health.json(), { ok: false, database: { configured: false, reachable: false } });
      for (const path of ['/cards', '/auth/github', '/copilot']) {
        assert.equal((await fetch(`${origin}${prefix}${path}`, { redirect: 'manual' })).status, 404);
      }
      const sync = await fetch(`${origin}${prefix}/learning/state`);
      assert.equal(sync.status, 503);
      assert.equal((await sync.json()).code, 'learning_sync_disabled');
    }
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }

  process.env.LEARNING_ONLY = 'false';
  const legacy = (await createServer()).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => legacy.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(legacy.address() as AddressInfo).port}/api/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  } finally { await new Promise<void>((resolve, reject) => legacy.close((error) => error ? reject(error) : resolve())); }
});
