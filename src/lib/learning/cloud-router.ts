import express, { type ErrorRequestHandler, type Response } from 'express';
import { MAX_BACKUP_BYTES } from './model';
import { syncOperationSchema } from './sync-model';
import { CloudConflict, type CloudStore } from './cloud-store';
import type { VerifiedIdentity } from './firebase-server';

function userId(response: Response): string {
  const value: unknown = response.locals.learningUser;
  if (typeof value !== 'string') throw new Error('unauthenticated');
  return value;
}

export function learningRouter(dependencies: {
  authenticate: (authorization: string | undefined) => Promise<VerifiedIdentity>;
  store: () => Promise<CloudStore>;
}) {
  const router = express.Router();
  router.use(async (request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    try {
      const identity = await dependencies.authenticate(request.headers.authorization);
      const store = await dependencies.store();
      response.locals.learningUser = await store.account(identity.projectId, identity.uid);
      next();
    } catch (cause) { next(cause); }
  });
  router.use(express.json({ limit: MAX_BACKUP_BYTES + 1024, strict: true }));
  router.get('/state', async (_request, response, next) => {
    try {
      response.json(await (await dependencies.store()).read(userId(response)));
    } catch (cause) { next(cause); }
  });
  router.put('/state', async (request, response, next) => {
    try {
      if (!request.is('application/json')) throw new Error('learning_invalid_request');
      const parsed = syncOperationSchema.safeParse(request.body);
      if (!parsed.success) throw new Error('learning_invalid_request');
      response.json(await (await dependencies.store()).write(userId(response), parsed.data));
    } catch (cause) { next(cause); }
  });
  const errorHandler: ErrorRequestHandler = (cause: unknown, _request, response, next) => {
    if (response.headersSent) { next(cause); return; }
    if (cause instanceof CloudConflict) {
      response.status(409).json({ code: 'learning_conflict', error: '另一部裝置已更新資料，正在檢查衝突。', head: cause.head });
      return;
    }
    const code = cause instanceof Error ? cause.message : '';
    const errors: Record<string, [number, string]> = {
      unauthenticated: [401, '登入已失效或被撤銷，請重新登入。待傳資料仍然保留。'],
      learning_identity_invalid: [401, '請使用已驗證嘅 Google 帳戶登入。'],
      learning_sync_disabled: [503, '管理員未啟用雲端同步；資料仍然只喺本機。'],
      learning_auth_not_configured: [503, '後端 Firebase 驗證尚未設定，請聯絡管理員。'],
      learning_auth_unavailable: [503, '後端暫時無法驗證登入或撤銷狀態，請稍後重試。'],
      database_unavailable: [503, '資料庫暫時無法使用；本機待傳資料仍然保留。'],
      learning_invalid_request: [400, '同步資料格式無效，雲端資料未改動。'],
      learning_operation_reused: [409, '同步操作識別重複但內容不同，請保留備份並聯絡管理員。'],
      learning_history_removed: [409, '預覽同步未支援刪除紀錄；為免遺失資料，本次上傳已中止。'],
      learning_history_changed: [409, '本次上傳會改寫既有答題或複習歷史，已中止。請先處理衝突。'],
      learning_revision_limit: [503, '同步版本已達上限，請聯絡管理員。'],
    };
    const parserType = typeof cause === 'object' && cause !== null && 'type' in cause ? cause.type : '';
    if (parserType === 'entity.too.large' || parserType === 'entity.parse.failed') {
      response.status(parserType === 'entity.too.large' ? 413 : 400)
        .json({ code: 'learning_invalid_request', error: '同步 JSON 無效或超出大小限制。' });
      return;
    }
    const result = errors[code];
    if (!result) console.error('[learning-api] unexpected_error');
    response.status(result?.[0] ?? 500).json({
      code: result ? code : 'learning_unavailable',
      error: result?.[1] ?? '同步服務出現錯誤，請稍後重試；本機資料仍然保留。',
    });
  };
  router.use(errorHandler);
  return router;
}
