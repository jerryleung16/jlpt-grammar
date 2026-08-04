'use client';

import { useEffect, useMemo, useState } from 'react';
import { getStoredGrammarCards, type GrammarCard } from '@/lib/grammar-data';
import SwipeableCard from '@/components/srs/SwipeableCard';

type ReviewPile = 'all' | 'easy' | 'difficult';
const LEVEL_OPTIONS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;

export default function ReviewQueue() {
  const [queue, setQueue] = useState<GrammarCard[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pile, setPile] = useState<ReviewPile>('all');
  const [selectedLevels, setSelectedLevels] = useState<string[]>([...LEVEL_OPTIONS]);

  useEffect(() => {
    const refreshQueue = () => setQueue(getStoredGrammarCards());
    refreshQueue();

    window.addEventListener('grammar-cards-updated', refreshQueue);
    return () => window.removeEventListener('grammar-cards-updated', refreshQueue);
  }, []);

  const reviewStats = useMemo(() => {
    const easyCount = queue.filter((card) => (card.difficultyGroup ?? 'easy') === 'easy').length;
    const difficultCount = queue.filter((card) => (card.difficultyGroup ?? 'easy') === 'difficult').length;

    return {
      total: queue.length,
      easy: easyCount,
      difficult: difficultCount,
    };
  }, [queue]);

  const filteredQueue = useMemo(() => {
    const byPile = pile === 'all' ? queue : queue.filter((card) => (card.difficultyGroup ?? 'easy') === pile);
    return byPile.filter((card) => selectedLevels.includes(card.level));
  }, [pile, queue, selectedLevels]);

  useEffect(() => {
    setActiveIndex(0);
  }, [pile, selectedLevels]);

  const activeCard = useMemo(() => filteredQueue[activeIndex] ?? filteredQueue[0], [activeIndex, filteredQueue]);

  const handleAdvance = () => {
    if (filteredQueue.length === 0) {
      return;
    }

    setActiveIndex((current) => (current + 1) % filteredQueue.length);
  };

  const toggleLevel = (level: string) => {
    setSelectedLevels((current) =>
      current.includes(level) ? current.filter((item) => item !== level) : [...current, level],
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
              review statistics
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">複習統計</h3>
          </div>
          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white dark:bg-blue-500">
            總卡數 {reviewStats.total}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-emerald-50 p-3 dark:bg-emerald-950/40">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
              易卡
            </p>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{reviewStats.easy}</p>
          </div>
          <div className="rounded-2xl bg-rose-50 p-3 dark:bg-rose-950/40">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300">
              難卡
            </p>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{reviewStats.difficult}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            目前牌組：{pile === 'all' ? '全部' : pile === 'easy' ? '易卡' : '難卡'} · 等級：
            {selectedLevels.length === LEVEL_OPTIONS.length ? '全部' : selectedLevels.join('、') || '無'}
          </span>
          <button
            onClick={handleAdvance}
            className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-blue-500"
          >
            下一張
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all', label: '全部' },
            { key: 'easy', label: '易卡' },
            { key: 'difficult', label: '難卡' },
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setPile(option.key as ReviewPile)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                pile === option.key
                  ? 'bg-slate-900 text-white dark:bg-blue-500'
                  : 'border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl bg-slate-50/80 p-3 dark:bg-slate-800/50">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">
              level filter
            </span>
            <span className="text-xs text-slate-600 dark:text-slate-300">
              {selectedLevels.length === LEVEL_OPTIONS.length ? '全部開啟' : `${selectedLevels.length} 個等級`}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {LEVEL_OPTIONS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => toggleLevel(level)}
                className={`rounded-full border px-4 py-2 text-sm font-bold shadow-sm transition-all duration-200 ${
                  selectedLevels.includes(level)
                    ? 'border-blue-500 bg-blue-500 text-white shadow-blue-500/30 ring-2 ring-blue-200 dark:ring-blue-900'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:text-blue-300'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeCard ? (
        <SwipeableCard
          key={`${activeCard.id}-${activeCard.pattern}`}
          cardId={activeCard.id}
          frontText={activeCard.frontText}
          meaning={activeCard.meaning}
          connection={activeCard.connection}
          example={activeCard.example}
          specialNote={activeCard.specialNote}
          onReviewed={handleAdvance}
        />
      ) : null}
    </div>
  );
}
