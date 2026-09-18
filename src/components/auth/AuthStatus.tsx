'use client';

import { useEffect, useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { getAuthUser, getGithubLoginUrl, logoutGithub } from '@/components/copilot/copilot-api';

type User = { id: string; login: string; avatarUrl: string | null };

export default function AuthStatus() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void getAuthUser()
      .then((result) => {
        if (active) setUser(result?.user ?? null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (isLoading) return null;

  if (!user) {
    return (
      <a
        href={getGithubLoginUrl()}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <LogIn size={15} aria-hidden="true" />
        GitHub 登入
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        void logoutGithub().then(() => setUser(null));
      }}
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      title="登出 GitHub"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold dark:bg-slate-700">
        {user.login.slice(0, 1).toUpperCase()}
      </span>
      <span>{user.login}</span>
      <LogOut size={14} aria-hidden="true" />
    </button>
  );
}
