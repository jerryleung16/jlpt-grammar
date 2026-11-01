import { z } from 'zod';

export type LearningScope = 'guest' | `firebase:${string}:${string}`;

export function accountScope(projectId: string, uid: string): LearningScope {
  if (!projectId.trim() || !uid.trim()) throw new Error('帳戶識別無效，未有開啟本機資料。');
  return `firebase:${encodeURIComponent(projectId)}:${encodeURIComponent(uid)}`;
}

const configSchema = z.object({
  apiKey: z.string().trim().min(1),
  authDomain: z.string().trim().regex(/^[a-zA-Z0-9.-]+$/, 'authDomain 必須係網域，唔可以包含網址路徑'),
  projectId: z.string().trim().regex(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/),
  appId: z.string().trim().min(1),
});
export type LearningFirebaseConfig = z.infer<typeof configSchema>;

export function parseFirebaseConfig(config: {
  apiKey?: string; authDomain?: string; projectId?: string; appId?: string;
}): LearningFirebaseConfig | null {
  if (Object.values(config).every((value) => !value?.trim())) return null;
  const parsed = configSchema.safeParse(config);
  if (!parsed.success) throw new Error('Google 登入設定未完整或格式有誤；請管理員檢查四項 Firebase Web 設定並重新建置。你仍然可以用訪客模式學習。');
  return parsed.data;
}

export function signInError(cause: unknown): string {
  const code = typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string'
    ? cause.code : '';
  const messages: Record<string, string> = {
    'auth/popup-closed-by-user': '登入視窗已關閉，未完成登入。你可以重試，或者繼續用訪客模式。',
    'auth/cancelled-popup-request': '上一個登入請求已取消，請用最新開啟嘅登入視窗。',
    'auth/popup-blocked': '瀏覽器封鎖咗登入視窗。請允許呢個網站開啟彈出視窗，再按 Google 登入。',
    'auth/unauthorized-domain': '呢個網域未獲 Firebase 授權。請管理員加入目前網域後再試。',
    'auth/operation-not-allowed': 'Firebase 尚未啟用 Google 登入，請管理員檢查 Authentication 設定。',
    'auth/network-request-failed': '登入服務暫時連唔到。請檢查網絡，再試一次；本機學習資料不受影響。',
    'auth/web-storage-unsupported': '瀏覽器未允許儲存登入狀態。請檢查私隱設定，或者繼續用訪客模式。',
    'auth/invalid-api-key': 'Firebase Web 設定無效，請管理員檢查 API key 並重新建置。',
    'auth/user-disabled': '呢個登入帳戶已停用，請聯絡管理員。',
  };
  return messages[code] ?? 'Google 登入服務出現錯誤，請重試。你仍然可以用訪客模式；現有資料唔會被重設。';
}
