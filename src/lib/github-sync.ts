'use client';

import { getStoredGrammarCards, saveGrammarCards, type GrammarCard } from '@/lib/grammar-data';

const TOKEN_STORAGE_KEY = 'jlpt-sync-github-token';
const GIST_ID_STORAGE_KEY = 'jlpt-sync-gist-id';
const SYNC_FILENAME = 'jlpt-grammar-sync.json';

type SyncPayload = {
  version: 1;
  updatedAt: string;
  cards: GrammarCard[];
};

type GistFile = {
  content?: string;
};

type GistResponse = {
  id: string;
  files?: Record<string, GistFile>;
};

export type GithubSyncConfig = {
  token: string;
  gistId: string;
};

async function githubRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
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
    throw new Error(text || `GitHub API 錯誤：${response.status}`);
  }

  return (await response.json()) as T;
}

export function getGithubSyncConfig(): GithubSyncConfig {
  if (typeof window === 'undefined') {
    return { token: '', gistId: '' };
  }

  return {
    token: window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? '',
    gistId: window.localStorage.getItem(GIST_ID_STORAGE_KEY) ?? '',
  };
}

export function saveGithubSyncConfig(config: GithubSyncConfig) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(TOKEN_STORAGE_KEY, config.token.trim());
  window.localStorage.setItem(GIST_ID_STORAGE_KEY, config.gistId.trim());
}

export async function uploadGrammarCardsToGithub(
  cards: GrammarCard[] = getStoredGrammarCards(),
  config: GithubSyncConfig = getGithubSyncConfig(),
): Promise<{ gistId: string }> {
  const token = config.token.trim();
  const gistId = config.gistId.trim();

  if (!token) {
    throw new Error('請先填入 GitHub 存取權杖。');
  }

  const payload: SyncPayload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    cards,
  };
  const body = {
    files: {
      [SYNC_FILENAME]: {
        content: JSON.stringify(payload, null, 2),
      },
    },
  };

  if (gistId) {
    await githubRequest<GistResponse>(token, `/gists/${gistId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return { gistId };
  }

  const created = await githubRequest<GistResponse>(token, '/gists', {
    method: 'POST',
    body: JSON.stringify({
      ...body,
      description: 'JLPT 文法卡片同步資料',
      public: false,
    }),
  });

  saveGithubSyncConfig({ token, gistId: created.id });
  return { gistId: created.id };
}

export async function downloadGrammarCardsFromGithub(
  config: GithubSyncConfig = getGithubSyncConfig(),
): Promise<GrammarCard[]> {
  const token = config.token.trim();
  const gistId = config.gistId.trim();

  if (!token) {
    throw new Error('請先填入 GitHub 存取權杖。');
  }

  if (!gistId) {
    throw new Error('請先填入 Gist 識別碼，或先執行一次備份建立 Gist。');
  }

  const gist = await githubRequest<GistResponse>(token, `/gists/${gistId}`);
  const file = gist.files?.[SYNC_FILENAME];

  if (!file?.content) {
    throw new Error('找不到同步檔案內容，請先在另一台裝置上傳。');
  }

  const parsed = JSON.parse(file.content) as Partial<SyncPayload>;
  if (!Array.isArray(parsed.cards)) {
    throw new Error('同步檔案格式不正確。');
  }

  saveGrammarCards(parsed.cards);
  return parsed.cards;
}
