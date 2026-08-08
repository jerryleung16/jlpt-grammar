'use client';

import { useState } from 'react';

type SwipeableCardProps = {
  frontText: string;
  meaning?: string;
  connection?: string;
  example?: string;
  specialNote?: string;
};

export default function SwipeableCard({
  frontText,
  meaning = '—',
  connection = '—',
  example = '—',
  specialNote = '—',
}: SwipeableCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <section className="flex flex-col items-center justify-center gap-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div
          onClick={() => setIsFlipped((current) => !current)}
          className="min-h-[420px] max-h-[70vh] cursor-pointer overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-950"
        >
          {!isFlipped ? (
            <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
              <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-bold tracking-[0.3em] text-blue-500">
                主動回憶
              </span>
              <h2 className="text-4xl font-bold text-slate-900 dark:text-white">{frontText}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                點擊翻開解釋，然後用下方按鈕標記這張卡片。
              </p>
            </div>
          ) : (
            <div className="flex h-full flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="rounded-2xl bg-emerald-50 px-3 py-2 dark:bg-emerald-950/40">
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-emerald-700 dark:text-emerald-300">
                    意思
                  </p>
                  <p className="mt-1 break-words whitespace-pre-wrap text-base leading-7 text-slate-700 dark:text-slate-200">
                    {meaning}
                  </p>
                </div>

                <div className="rounded-2xl bg-sky-50 px-3 py-2 dark:bg-sky-950/40">
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-sky-700 dark:text-sky-300">
                    接続
                  </p>
                  <p className="mt-1 break-words whitespace-pre-wrap text-base leading-7 text-slate-700 dark:text-slate-200">
                    {connection}
                  </p>
                </div>

                <div className="rounded-2xl bg-amber-50 px-3 py-2 dark:bg-amber-950/40">
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-700 dark:text-amber-300">
                    例句
                  </p>
                  <p className="mt-1 break-words whitespace-pre-wrap text-base leading-7 text-slate-700 dark:text-slate-200">
                    {example}
                  </p>
                </div>

                <div className="rounded-2xl bg-fuchsia-50 px-3 py-2 dark:bg-fuchsia-950/40">
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-fuchsia-700 dark:text-fuchsia-300">
                    特別說明
                  </p>
                  <p className="mt-1 break-words whitespace-pre-wrap text-base leading-7 text-slate-700 dark:text-slate-200">
                    {specialNote}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsFlipped(false);
                }}
                className="mt-2 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                翻回正面
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
