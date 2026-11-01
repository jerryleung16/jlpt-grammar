import { databasePool } from '@/lib/hosted-store';
import { createCloudStore, learningSchema, type CloudStore } from './cloud-store';

let store: Promise<CloudStore> | undefined;
export function hostedLearning() {
  store ??= (async () => {
    const pool = databasePool();
    await pool.query(learningSchema);
    return createCloudStore({
      query: (text, values) => pool.query(text, values),
      async transaction(work) {
        const connection = await pool.connect();
        try {
          await connection.query('BEGIN');
          const result = await work(connection);
          await connection.query('COMMIT');
          return result;
        } catch (cause) {
          try { await connection.query('ROLLBACK'); }
          catch { console.error('[learning-api] rollback_failed'); }
          throw cause;
        } finally { connection.release(); }
      },
    });
  })().catch((cause) => { store = undefined; throw cause; });
  return store;
}
