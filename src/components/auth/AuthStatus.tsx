'use client';

import { useEffect, useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import {
  completeGithubLogin,
  consumeGithubLoginReturnPath,
  getAuthUser,
  getGithubLoginUrl,
  logoutGithub,
  startGithubLogin,
} from '@/components/copilot/copilot-api';

type User = { id: string; login: string; avatarUrl: string | null };

export default function AuthStatus() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const retryUser = () => {
    setIsLoading(true);
    setError(false);
    const active = true;
    void getAuthUser()
      .then((result) => {
        if (active) setUser(result?.user ?? null);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
  };

  useEffect(() => {
    let active = true;
    const callbackCode = new URLSearchParams(window.location.hash.slice(1)).get('oauth_code');
    const loadUser = async () => {
      try {
        if (callbackCode) {
          const returnPath = consumeGithubLoginReturnPath();
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
          const result = await completeGithubLogin(callbackCode);
          if (active) setUser(result.user);
          if (returnPath.startsWith('#')) {
            window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${returnPath}`);
          }
        } else {
          const result = await getAuthUser();
          if (active) setUser(result?.user ?? null);
        }
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void loadUser();
    return () => {
      active = false;
    };
  }, []);

  if (isLoading) return null;

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={getGithubLoginUrl()}
          onClick={(event) => {
            event.preventDefault();
            setIsLoading(true);
            setError(false);
            void startGithubLogin()
              .then((url) => window.location.assign(url))
              .catch(() => {
                setError(true);
                setIsLoading(false);
              });
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <LogIn size={15} aria-hidden="true" />
          GitHub 登入
        </a>
        {error ? <button type="button" onClick={retryUser} className="text-xs font-semibold text-blue-700 underline dark:text-blue-300">重試</button> : null}
      </div>
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
