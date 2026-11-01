import assert from 'node:assert/strict';
import test from 'node:test';
import { learningSchema } from './cloud-store';

test('learning initialization does not initialize legacy tables, while legacy initialization remains available', async (context) => {
  const previousUrl = process.env.DATABASE_URL;
  const previousMode = process.env.LEARNING_ONLY;
  process.env.LEARNING_ONLY = 'true';
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/isolated-test';
  const { databasePool, database, databaseHealth } = await import('../hosted-store');
  if (previousMode === undefined) delete process.env.LEARNING_ONLY;
  else process.env.LEARNING_ONLY = previousMode;
  if (previousUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousUrl;
  const pool = databasePool();
  context.after(async () => { await pool.end(); });
  const statements: string[] = [];
  context.mock.method(pool, 'query', async (text: unknown) => {
    assert.equal(typeof text, 'string');
    statements.push(String(text));
    return { rows: [], command: 'CREATE', rowCount: 0, oid: 0, fields: [] };
  });
  assert.equal(databasePool(), pool);
  assert.deepEqual(statements, []);
  assert.equal(new URL(pool.options.connectionString!).searchParams.get('sslmode'), 'verify-full');
  assert.deepEqual(pool.options.ssl, { rejectUnauthorized: true });
  assert.deepEqual(await databaseHealth(false), { configured: true, reachable: true });
  assert.deepEqual(statements, ['SELECT 1']);
  statements.length = 0;

  const { hostedLearning } = await import('./hosted-learning');
  const store = await hostedLearning();
  assert.equal(await hostedLearning(), store);
  assert.deepEqual(statements, [learningSchema]);
  assert.doesNotMatch(statements[0], /app_users|grammar_cards|copilot_/);

  assert.equal(await database(), pool);
  assert.equal(await database(), pool);
  assert.equal(statements.length, 2);
  assert.match(statements[1], /CREATE TABLE IF NOT EXISTS app_users/);
});
