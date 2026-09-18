import { Pool } from 'pg';
import type { GrammarCard } from '@/lib/grammar-data';
import type { GrammarMutationProposal } from '@/lib/copilot-context';

export type HostedUser = {
  id: string;
  githubId: string;
  login: string;
  avatarUrl: string | null;
  encryptedAccessToken: string;
};

export type StoredCopilotSession = {
  id: string;
  userId: string;
  name: string;
  sdkSessionId: string;
  createdAt: number;
  lastUsedAt: number;
  requestCount: number;
};

export type StoredCopilotTurn = {
  id: string;
  sessionId: string;
  prompt: string;
  context: string;
  response: string | null;
  proposals: GrammarMutationProposal[];
  status: 'pending' | 'success' | 'error';
  error: string | null;
  createdAt: number;
  updatedAt: number;
};

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.DATABASE_POOL_MAX || 10),
    })
  : null;

let schemaPromise: Promise<void> | undefined;

function databaseUnavailable(): never {
  throw new Error('database_unavailable');
}

export function hasDatabase() {
  return Boolean(pool);
}

async function database() {
  if (!pool) databaseUnavailable();
  schemaPromise ??= (async () => {
    await pool.query(`
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
      CREATE TABLE IF NOT EXISTS grammar_cards (
        user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        card_id TEXT NOT NULL,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, card_id)
      );
      CREATE TABLE IF NOT EXISTS copilot_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
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
      CREATE INDEX IF NOT EXISTS copilot_sessions_user_idx ON copilot_sessions(user_id, last_used_at DESC);
      CREATE INDEX IF NOT EXISTS copilot_turns_session_idx ON copilot_turns(session_id, created_at ASC);
    `);
  })();
  await schemaPromise;
  return pool;
}

function timestamp(value: Date | string) {
  return new Date(value).getTime();
}

export async function databaseHealth() {
  if (!pool) return { configured: false, reachable: false };
  try {
    const client = await database();
    await client.query('SELECT 1');
    return { configured: true, reachable: true };
  } catch {
    return { configured: true, reachable: false };
  }
}

export async function upsertUser(user: HostedUser) {
  const client = await database();
  await client.query(
    `INSERT INTO app_users (id, github_id, login, avatar_url, encrypted_access_token)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (github_id) DO UPDATE SET
       login = EXCLUDED.login,
       avatar_url = EXCLUDED.avatar_url,
       encrypted_access_token = EXCLUDED.encrypted_access_token,
       updated_at = NOW()`,
    [user.id, user.githubId, user.login, user.avatarUrl, user.encryptedAccessToken],
  );
}

export async function getUserBySessionHash(sessionHash: string) {
  const client = await database();
  const result = await client.query(
    `SELECT u.id, u.github_id, u.login, u.avatar_url, u.encrypted_access_token
     FROM auth_sessions s JOIN app_users u ON u.id = s.user_id
     WHERE s.id_hash = $1 AND s.expires_at > NOW()`,
    [sessionHash],
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id as string,
        githubId: row.github_id as string,
        login: row.login as string,
        avatarUrl: (row.avatar_url as string | null) ?? null,
        encryptedAccessToken: row.encrypted_access_token as string,
      }
    : null;
}

export async function createAuthSession(sessionHash: string, userId: string, expiresAt: Date) {
  const client = await database();
  await client.query(
    'INSERT INTO auth_sessions (id_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [sessionHash, userId, expiresAt],
  );
}

export async function deleteAuthSession(sessionHash: string) {
  const client = await database();
  await client.query('DELETE FROM auth_sessions WHERE id_hash = $1', [sessionHash]);
}

export async function listCopilotSessions(userId: string) {
  const client = await database();
  const result = await client.query(
    `SELECT id, user_id, name, sdk_session_id, created_at, last_used_at, request_count
     FROM copilot_sessions WHERE user_id = $1 ORDER BY last_used_at DESC`,
    [userId],
  );
  return result.rows.map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    sdkSessionId: row.sdk_session_id as string,
    createdAt: timestamp(row.created_at),
    lastUsedAt: timestamp(row.last_used_at),
    requestCount: row.request_count as number,
  }));
}

export async function getCopilotSession(userId: string, sessionId: string) {
  const client = await database();
  const result = await client.query(
    `SELECT id, user_id, name, sdk_session_id, created_at, last_used_at, request_count
     FROM copilot_sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId],
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id as string,
        userId: row.user_id as string,
        name: row.name as string,
        sdkSessionId: row.sdk_session_id as string,
        createdAt: timestamp(row.created_at),
        lastUsedAt: timestamp(row.last_used_at),
        requestCount: row.request_count as number,
      }
    : null;
}

export async function createCopilotSession(session: StoredCopilotSession) {
  const client = await database();
  await client.query(
    `INSERT INTO copilot_sessions (id, user_id, name, sdk_session_id, created_at, last_used_at, request_count)
     VALUES ($1, $2, $3, $4, TO_TIMESTAMP($5 / 1000.0), TO_TIMESTAMP($6 / 1000.0), $7)`,
    [session.id, session.userId, session.name, session.sdkSessionId, session.createdAt, session.lastUsedAt, session.requestCount],
  );
}

export async function touchCopilotSession(sessionId: string, requestCount?: number) {
  const client = await database();
  await client.query(
    `UPDATE copilot_sessions SET last_used_at = NOW(), request_count = COALESCE($2, request_count)
     WHERE id = $1`,
    [sessionId, requestCount ?? null],
  );
}

export async function updateCopilotSdkSession(sessionId: string, sdkSessionId: string) {
  const client = await database();
  await client.query('UPDATE copilot_sessions SET sdk_session_id = $2, last_used_at = NOW() WHERE id = $1', [sessionId, sdkSessionId]);
}

export async function deleteCopilotSession(userId: string, sessionId: string) {
  const client = await database();
  await client.query('DELETE FROM copilot_sessions WHERE id = $1 AND user_id = $2', [sessionId, userId]);
}

export async function listCopilotTurns(sessionId: string) {
  const client = await database();
  const result = await client.query(
    `SELECT id, session_id, prompt, context, response, proposals, status, error, created_at, updated_at
     FROM copilot_turns WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId],
  );
  return result.rows.map((row) => ({
    id: row.id as string,
    sessionId: row.session_id as string,
    prompt: row.prompt as string,
    context: row.context as string,
    response: (row.response as string | null) ?? null,
    proposals: (row.proposals as GrammarMutationProposal[]) ?? [],
    status: row.status as StoredCopilotTurn['status'],
    error: (row.error as string | null) ?? null,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  }));
}

export async function createCopilotTurn(turn: StoredCopilotTurn) {
  const client = await database();
  await client.query(
    `INSERT INTO copilot_turns (id, session_id, prompt, context, response, proposals, status, error, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, TO_TIMESTAMP($9 / 1000.0), TO_TIMESTAMP($10 / 1000.0))`,
    [turn.id, turn.sessionId, turn.prompt, turn.context, turn.response, JSON.stringify(turn.proposals), turn.status, turn.error, turn.createdAt, turn.updatedAt],
  );
}

export async function updateCopilotTurn(turn: StoredCopilotTurn) {
  const client = await database();
  await client.query(
    `UPDATE copilot_turns SET response = $2, proposals = $3::jsonb, status = $4, error = $5, updated_at = TO_TIMESTAMP($6 / 1000.0)
     WHERE id = $1`,
    [turn.id, turn.response, JSON.stringify(turn.proposals), turn.status, turn.error, turn.updatedAt],
  );
}

function isGrammarCard(value: unknown): value is GrammarCard {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const card = value as Record<string, unknown>;
  return ['id', 'level', 'pattern', 'meaning', 'connection', 'example', 'specialNote', 'frontText', 'backExplanation']
    .every((field) => typeof card[field] === 'string')
    && (card.difficultyGroup === undefined || card.difficultyGroup === 'easy' || card.difficultyGroup === 'difficult');
}

export function validateGrammarCards(value: unknown): value is GrammarCard[] {
  return Array.isArray(value) && value.every(isGrammarCard);
}

export async function getGrammarCards(userId: string) {
  const client = await database();
  const result = await client.query('SELECT data FROM grammar_cards WHERE user_id = $1 ORDER BY updated_at DESC', [userId]);
  return result.rows.map((row) => row.data as GrammarCard);
}

export async function replaceGrammarCards(userId: string, cards: GrammarCard[]) {
  const client = await database();
  await client.query('BEGIN');
  try {
    await client.query('DELETE FROM grammar_cards WHERE user_id = $1', [userId]);
    for (const card of cards) {
      await client.query(
        `INSERT INTO grammar_cards (user_id, card_id, data) VALUES ($1, $2, $3::jsonb)`,
        [userId, card.id, JSON.stringify(card)],
      );
    }
    await client.query('UPDATE app_users SET cards_initialized = TRUE WHERE id = $1', [userId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function initializeDefaultGrammarCards(userId: string, cards: GrammarCard[]) {
  const client = await database();
  const result = await client.query(
    'UPDATE app_users SET cards_initialized = TRUE WHERE id = $1 AND cards_initialized = FALSE RETURNING id',
    [userId],
  );
  if (result.rowCount !== 1) return;
  for (const card of cards) {
    await client.query(
      'INSERT INTO grammar_cards (user_id, card_id, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT DO NOTHING',
      [userId, card.id, JSON.stringify(card)],
    );
  }
}
