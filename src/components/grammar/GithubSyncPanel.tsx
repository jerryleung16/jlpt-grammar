'use client';

import { FormEvent, useMemo, useState } from 'react';
import { getStoredGrammarCards, saveGrammarCards } from '@/lib/grammar-data';

const TOKEN_STORAGE_KEY = 'jlpt-sync-github-token';
const GIST_ID_STORAGE_KEY = 'jlpt-sync-gist-id';
const SYNC_FILENAME = 'jlpt-grammar-sync.json';

type SyncPayload = {
  version: 1;
  updatedAt: string;
  cards: ReturnType<typeof getStoredGrammarCards>;
};

type GistFile = {
  content?: string;
};

type GistResponse = {
  id: string;
  files?: Record<string, GistFile>;
};

async function githubRequest<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `GitHub API error: ${response.status}`);
  }

  return (await response.json()) as T;
}

export default function GithubSyncPanel() {
  const [token, setToken] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
  });
  const [gistId, setGistId] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    return window.localStorage.getItem(GIST_ID_STORAGE_KEY) ?? '';
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState('');

  const canSync = useMemo(() => token.trim().length > 0, [token]);

  const handleSaveConfig = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
    window.localStorage.setItem(GIST_ID_STORAGE_KEY, gistId.trim());
    setMessage('已儲存同步設定。');
  };

  const handleUpload = async () => {
    if (!canSync) {
      setMessage('請先填入 GitHub Token。');
      return;
    }

    setIsSaving(true);
    setMessage('');

    try {
      const payload: SyncPayload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        cards: getStoredGrammarCards(),
      };

      const body = {
        files: {
          [SYNC_FILENAME]: {
            content: JSON.stringify(payload, null, 2),
          },
        },
      };

      const trimmedGistId = gistId.trim();
      if (trimmedGistId) {
        await githubRequest<GistResponse>(token.trim(), `/gists/${trimmedGistId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        setMessage('已上傳到既有 Gist，同步完成。');
      } else {
        const created = await githubRequest<GistResponse>(token.trim(), '/gists', {
          method: 'POST',
          body: JSON.stringify({
            ...body,
            description: 'JLPT grammar app sync data',
            public: false,
          }),
        });

        setGistId(created.id);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(GIST_ID_STORAGE_KEY, created.id);
        }
        setMessage(`已建立同步 Gist，ID: ${created.id}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '同步失敗';
      setMessage(`上傳失敗：${errorMessage}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!canSync) {
      setMessage('請先填入 GitHub Token。');
      return;
    }

    if (!gistId.trim()) {
      setMessage('請先填入 Gist ID，或先執行一次上傳建立 Gist。');
      return;
    }

    setIsSyncing(true);
    setMessage('');

    try {
      const gist = await githubRequest<GistResponse>(token.trim(), `/gists/${gistId.trim()}`);
      const file = gist.files?.[SYNC_FILENAME];

      if (!file?.content) {
        setMessage('找不到同步檔案內容，請先在另一台裝置上傳。');
        return;
      }

      const parsed = JSON.parse(file.content) as Partial<SyncPayload>;
      if (!Array.isArray(parsed.cards)) {
        setMessage('同步檔案格式不正確。');
        return;
      }

      saveGrammarCards(parsed.cards);
      setMessage('已從 GitHub 下載並套用最新文法卡片。');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '同步失敗';
      setMessage(`下載失敗：${errorMessage}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">跨裝置同步</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            用 GitHub Token + Gist 在不同裝置同步文法卡片資料。
          </p>
        </div>
      </div>

      <form onSubmit={handleSaveConfig} className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
          <span>GitHub Token</span>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="ghp_xxx..."
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none dark:border-slate-700 dark:bg-slate-950"
          />
        </label>

        <label className="space-y-1 text-sm text-slate-700 dark:text-slate-200">
          <span>Gist ID（首次可留空）</span>
          <input
            value={gistId}
            onChange={(event) => setGistId(event.target.value)}
            placeholder="例如：a1b2c3d4..."
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none dark:border-slate-700 dark:bg-slate-950"
          />
        </label>

        <div className="flex items-end">
          <button
            type="submit"
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            儲存設定
          </button>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isSaving}
          onClick={handleUpload}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-400"
        >
          {isSaving ? '上傳中...' : '上傳到 GitHub'}
        </button>
        <button
          type="button"
          disabled={isSyncing}
          onClick={handleDownload}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {isSyncing ? '下載中...' : '從 GitHub 下載'}
        </button>
      </div>

      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        建議使用只給必要權限的 Token，並避免在公共電腦儲存登入資訊。
      </p>

      {message ? <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-300">{message}</p> : null}
    </section>
  );
}