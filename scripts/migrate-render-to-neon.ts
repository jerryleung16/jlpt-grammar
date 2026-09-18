import { Pool, type PoolClient } from 'pg';
import { stdin as input, stdout as output } from 'node:process';

type TableName =
  | 'app_users'
  | 'auth_sessions'
  | 'oauth_handoffs'
  | 'grammar_cards'
  | 'copilot_agents'
  | 'copilot_sessions'
  | 'copilot_turns';

const tables: TableName[] = [
  'app_users',
  'auth_sessions',
  'oauth_handoffs',
  'grammar_cards',
  'copilot_agents',
  'copilot_sessions',
  'copilot_turns',
];

let pendingInput = '';

const schema = `
  CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY,
    github_id TEXT NOT NULL UNIQUE,
    login TEXT NOT NULL,
    avatar_url TEXT,
    encrypted_access_token TEXT NOT NULL,
    cards_initialized BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE app_users ADD COLUMN IF NOT EXISTS cards_initialized BOOLEAN NOT NULL DEFAULT FALSE;
  CREATE TABLE IF NOT EXISTS auth_sessions (
    id_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS oauth_handoffs (
    code_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    verifier_challenge TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS grammar_cards (
    user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    card_id TEXT NOT NULL,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, card_id)
  );
  CREATE TABLE IF NOT EXISTS copilot_agents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    instructions TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)
  );
  CREATE TABLE IF NOT EXISTS copilot_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    agent_id TEXT REFERENCES copilot_agents(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    sdk_session_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS copilot_turns (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES copilot_sessions(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    context TEXT NOT NULL,
    response TEXT,
    proposals JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE copilot_sessions ADD COLUMN IF NOT EXISTS agent_id TEXT REFERENCES copilot_agents(id) ON DELETE SET NULL;
  ALTER TABLE copilot_turns ADD COLUMN IF NOT EXISTS source_turn_id TEXT REFERENCES copilot_turns(id) ON DELETE SET NULL;
  ALTER TABLE copilot_turns ADD COLUMN IF NOT EXISTS attempt_type TEXT NOT NULL DEFAULT 'initial';
  ALTER TABLE copilot_turns ADD COLUMN IF NOT EXISTS model TEXT;
  ALTER TABLE copilot_turns ADD COLUMN IF NOT EXISTS input_tokens INTEGER;
  ALTER TABLE copilot_turns ADD COLUMN IF NOT EXISTS output_tokens INTEGER;
  ALTER TABLE copilot_turns ADD COLUMN IF NOT EXISTS total_tokens INTEGER;
  ALTER TABLE copilot_turns ADD COLUMN IF NOT EXISTS total_nano_aiu BIGINT;
  CREATE INDEX IF NOT EXISTS copilot_sessions_user_idx ON copilot_sessions(user_id, last_used_at DESC);
  CREATE INDEX IF NOT EXISTS copilot_agents_user_idx ON copilot_agents(user_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS copilot_turns_session_idx ON copilot_turns(session_id, created_at ASC);
  CREATE INDEX IF NOT EXISTS oauth_handoffs_expiry_idx ON oauth_handoffs(expires_at);
`;

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function promptForUrl(label: string) {
  const stdin = input as NodeJS.ReadStream & { setRawMode?: (mode: boolean) => void };
  const value = await new Promise<string>((resolve, reject) => {
    let value = pendingInput;
    pendingInput = '';
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      if (text === '\u0003') {
        cleanup();
        reject(new Error('cancelled'));
        return;
      }
      value += text;
      const protocolIndex = value.indexOf('postgresql://', 'postgresql://'.length);
      const postgresProtocolIndex = value.indexOf('postgres://', 'postgres://'.length);
      const secondProtocolIndex = [protocolIndex, postgresProtocolIndex]
        .filter((index) => index >= 0)
        .sort((left, right) => left - right)[0];
      if (secondProtocolIndex !== undefined) {
        pendingInput = value.slice(secondProtocolIndex).replace(/^[\r\n]+/, '');
        cleanup();
        output.write('\n');
        resolve(value.slice(0, secondProtocolIndex).trim());
        return;
      }
      if (value.endsWith('\r') || value.endsWith('\n')) {
        cleanup();
        output.write('\n');
        resolve(value.replace(/[\r\n]+$/, '').trim());
        return;
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode?.(false);
      stdin.pause();
    };
    output.write(`${label} connection string (hidden): `);
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.on('data', onData);
  });
  if (!value.startsWith('postgres://') && !value.startsWith('postgresql://')) {
    throw new Error(`${label} must be a PostgreSQL connection string`);
  }
  return value;
}

async function ensureTargetIsEmpty(client: PoolClient) {
  const counts: Array<{ table: TableName; count: number }> = [];
  for (const table of tables) {
    const result = await client.query(`SELECT COUNT(*)::integer AS count FROM ${quoteIdentifier(table)}`);
    counts.push({ table, count: result.rows[0].count as number });
  }
  const nonEmpty = counts.filter(({ count }) => count > 0);
  if (nonEmpty.length > 0) {
    throw new Error(`Neon database is not empty: ${nonEmpty.map(({ table, count }) => `${table}=${count}`).join(', ')}`);
  }
}

async function copyTable(source: PoolClient, target: PoolClient, table: TableName) {
  const result = await source.query(`SELECT * FROM ${quoteIdentifier(table)}`);
  if (result.rows.length === 0) return 0;

  const columns = result.fields.map((field) => field.name);
  const columnSql = columns.map(quoteIdentifier).join(', ');
  const valueSql = columns.map((_, index) => `$${index + 1}`).join(', ');
  for (const row of result.rows) {
    await target.query(
      `INSERT INTO ${quoteIdentifier(table)} (${columnSql}) VALUES (${valueSql})`,
      columns.map((column) => row[column]),
    );
  }
  return result.rows.length;
}

async function main() {
  console.log('Do not paste connection strings into chat or commit them.');
  console.log('Pause writes to the Render app before continuing.');
  const sourceUrl = await promptForUrl('Render');
  const targetUrl = await promptForUrl('Neon');
  const source = new Pool({ connectionString: sourceUrl, max: 2, ssl: { rejectUnauthorized: false } });
  const target = new Pool({ connectionString: targetUrl, max: 2, ssl: { rejectUnauthorized: false } });
  try {
    const sourceClient = await source.connect();
    const targetClient = await target.connect();
    try {
      await sourceClient.query('SELECT 1');
      await targetClient.query('SELECT 1');
      await targetClient.query(schema);
      await ensureTargetIsEmpty(targetClient);
      await targetClient.query('BEGIN');
      const copied: Record<string, number> = {};
      for (const table of tables) {
        copied[table] = await copyTable(sourceClient, targetClient, table);
      }
      await targetClient.query('COMMIT');
      console.log(JSON.stringify({ migrated: true, rows: copied }, null, 2));
    } catch (error) {
      await targetClient.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      sourceClient.release();
      targetClient.release();
    }
  } finally {
    await Promise.all([source.end(), target.end()]);
  }
}

main().catch((error) => {
  console.error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
