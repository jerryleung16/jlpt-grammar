import { acceptSync, loadSync, prepareSync, reconcileSync } from './store';
import type { LearningScope } from './identity';
import { cloudHeadSchema, syncReceiptSchema, type CloudHead, type SyncOperation } from './sync-model';

export class RemoteConflict extends Error {
  constructor(public readonly head: CloudHead) { super('learning_conflict'); }
}
export class SyncRequestError extends Error {
  readonly retryable: boolean;
  constructor(public readonly status: number, message: string) {
    super(message);
    this.retryable = status === 429 || status >= 500;
  }
}
export interface SyncTransport {
  read(signal?: AbortSignal): Promise<CloudHead>;
  write(operation: SyncOperation, signal?: AbortSignal): Promise<{ revision: number }>;
}

export function createSyncTransport(baseUrl: string, getToken: () => Promise<string>): SyncTransport {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('同步 API 必須使用 HTTPS；只有本機測試可以使用 HTTP。');
  }
  if (url.username || url.password || url.search || url.hash) throw new Error('同步 API 網址唔可以包含憑證、查詢參數或 fragment。');
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/learning/state`;
  const request = async (operation?: SyncOperation, signal?: AbortSignal) => {
    const token = await getToken();
    // Free Render instances may need around a minute to wake up.
    const timeout = AbortSignal.timeout(90000);
    const response = await fetch(endpoint, {
      method: operation ? 'PUT' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(operation ? { 'Content-Type': 'application/json' } : {}) },
      body: operation ? JSON.stringify(operation) : undefined,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    });
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new SyncRequestError(response.status >= 400 ? response.status : 502, '同步 API 未回覆有效 JSON；服務可能正在喚醒，請稍後重試，或檢查後端網址及部署狀態。本機資料仍然保留。');
    }
    const payload: unknown = await response.json();
    if (!response.ok) {
      if (response.status === 409 && typeof payload === 'object' && payload !== null &&
        'code' in payload && payload.code === 'learning_conflict' && 'head' in payload) {
        throw new RemoteConflict(cloudHeadSchema.parse(payload.head));
      }
      const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
        ? payload.error : `同步失敗（HTTP ${response.status}）；本機資料仍然保留。`;
      throw new SyncRequestError(response.status, message);
    }
    return payload;
  };
  return {
    async read(signal) { return cloudHeadSchema.parse(await request(undefined, signal)); },
    async write(operation, signal) { return syncReceiptSchema.parse(await request(operation, signal)); },
  };
}

export async function syncOnce(scope: LearningScope, transport: SyncTransport, signal?: AbortSignal) {
  let state = await loadSync(scope);
  if (!state.enabled) return state;
  if (!state.outbox) state = await reconcileSync(scope, await transport.read(signal));
  for (let count = 0; count < 3; count += 1) {
    signal?.throwIfAborted();
    state = await prepareSync(scope);
    if (!state.enabled || state.conflict || !state.outbox) return state;
    const operation = state.outbox;
    try {
      const receipt = await transport.write(operation, signal);
      state = await acceptSync(scope, operation.operationId, receipt.revision);
    } catch (cause) {
      if (!(cause instanceof RemoteConflict)) throw cause;
      state = await reconcileSync(scope, cause.head, operation.operationId);
    }
  }
  return state;
}
