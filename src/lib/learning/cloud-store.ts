import { createHash, randomUUID } from 'node:crypto';
import { cloudHeadSchema, assertPreservedHistory, syncReceiptSchema, type CloudHead, type SyncOperation } from './sync-model';

export interface SqlConnection {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}
export interface LearningSql extends SqlConnection {
  transaction<T>(work: (connection: SqlConnection) => Promise<T>): Promise<T>;
}
export const learningSchema = `
  CREATE TABLE IF NOT EXISTS learning_accounts (
    id TEXT PRIMARY KEY,
    firebase_project TEXT NOT NULL,
    firebase_uid TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(firebase_project, firebase_uid)
  );
  CREATE TABLE IF NOT EXISTS learning_snapshots (
    user_id TEXT PRIMARY KEY REFERENCES learning_accounts(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL CHECK (revision > 0),
    snapshot JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS learning_sync_operations (
    user_id TEXT NOT NULL REFERENCES learning_accounts(id) ON DELETE CASCADE,
    operation_id TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    revision INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(user_id, operation_id)
  );
`;

export class CloudConflict extends Error {
  constructor(public readonly head: CloudHead) { super('learning_conflict'); }
}
export function createCloudStore(db: LearningSql) {
  const read = async (connection: SqlConnection, userId: string): Promise<CloudHead> => {
    const { rows } = await connection.query('SELECT revision, snapshot FROM learning_snapshots WHERE user_id = $1', [userId]);
    return cloudHeadSchema.parse(rows[0] ?? { revision: 0, snapshot: null });
  };
  return {
    async account(projectId: string, uid: string) {
      const { rows } = await db.query(
        `INSERT INTO learning_accounts (id, firebase_project, firebase_uid) VALUES ($1, $2, $3)
         ON CONFLICT (firebase_project, firebase_uid) DO UPDATE SET firebase_uid = EXCLUDED.firebase_uid RETURNING id`,
        [randomUUID(), projectId, uid],
      );
      if (typeof rows[0]?.id !== 'string') throw new Error('database_unavailable');
      return rows[0].id;
    },
    read(userId: string) { return read(db, userId); },
    async write(userId: string, operation: SyncOperation) {
      const hash = createHash('sha256').update(JSON.stringify(operation)).digest('hex');
      return db.transaction(async (connection) => {
        const account = await connection.query('SELECT id FROM learning_accounts WHERE id = $1 FOR UPDATE', [userId]);
        if (!account.rows.length) throw new Error('unauthenticated');
        const previous = await connection.query(
          'SELECT request_hash, revision FROM learning_sync_operations WHERE user_id = $1 AND operation_id = $2',
          [userId, operation.operationId],
        );
        if (previous.rows.length) {
          if (previous.rows[0].request_hash !== hash) throw new Error('learning_operation_reused');
          return syncReceiptSchema.parse({ revision: previous.rows[0].revision });
        }
        const head = await read(connection, userId);
        if (head.revision !== operation.baseRevision) throw new CloudConflict(head);
        assertPreservedHistory(head.snapshot, operation.snapshot);
        const revision = head.revision + 1;
        if (revision > 2147483646) throw new Error('learning_revision_limit');
        await connection.query(
          `INSERT INTO learning_snapshots (user_id, revision, snapshot) VALUES ($1, $2, $3::jsonb)
           ON CONFLICT (user_id) DO UPDATE SET revision = EXCLUDED.revision, snapshot = EXCLUDED.snapshot, updated_at = NOW()`,
          [userId, revision, JSON.stringify(operation.snapshot)],
        );
        await connection.query(
          'INSERT INTO learning_sync_operations (user_id, operation_id, request_hash, revision) VALUES ($1, $2, $3, $4)',
          [userId, operation.operationId, hash, revision],
        );
        return { revision };
      });
    },
  };
}
export type CloudStore = ReturnType<typeof createCloudStore>;
