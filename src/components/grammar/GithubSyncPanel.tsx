'use client';

import { FormEvent, useState } from 'react';
import {
  downloadGrammarCardsFromGithub,
  getGithubSyncConfig,
  saveGithubSyncConfig,
  uploadGrammarCardsToGithub,
} from '@/lib/github-sync';

export default function GithubSyncPanel() {
  const [token, setToken] = useState(() => {
    return getGithubSyncConfig().token;
  });
  const [gistId, setGistId] = useState(() => {
    return getGithubSyncConfig().gistId;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState('');

  const handleSaveConfig = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (typeof window === 'undefined') {
      return;
    }

    saveGithubSyncConfig({ token, gistId });
    setMessage('已儲存同步設定。');
  };

  const handleUpload = async () => {
    setIsSaving(true);
    setMessage('');

    try {
      const result = await uploadGrammarCardsToGithub(undefined, { token, gistId });
      setGistId(result.gistId);
      setMessage(`已備份至 GitHub，Gist 識別碼：${result.gistId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '同步失敗';
      setMessage(`上傳失敗：${errorMessage}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = async () => {
    setIsSyncing(true);
    setMessage('');

    try {
      await downloadGrammarCardsFromGithub({ token, gistId });
      setMessage('已從 GitHub 下載並套用最新文法卡片。');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '同步失敗';
      setMessage(`下載失敗：${errorMessage}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <section id="github-sync" className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">跨裝置同步</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            使用 GitHub 存取權杖驗證，並透過私人 Gist 在不同裝置同步文法卡片資料。
          </p>
        </div>
      </div>

      <form onSubmit={handleSaveConfig} className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
          <span>GitHub 存取權杖</span>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="ghp_xxx..."
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none dark:border-slate-700 dark:bg-slate-950"
          />
        </label>

        <label className="space-y-1 text-sm text-slate-700 dark:text-slate-200">
          <span>Gist 識別碼（首次可留空）</span>
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
          {isSaving ? '上傳中……' : '上傳至 GitHub'}
        </button>
        <button
          type="button"
          disabled={isSyncing}
          onClick={handleDownload}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {isSyncing ? '下載中……' : '從 GitHub 下載'}
        </button>
      </div>

      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        建議使用只給必要權限的 Token，並避免在公共電腦儲存登入資訊。
      </p>

      {message ? <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-300">{message}</p> : null}
    </section>
  );
}