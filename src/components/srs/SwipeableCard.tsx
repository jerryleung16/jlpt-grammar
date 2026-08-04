'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs';
import { getStoredGrammarCards, saveGrammarCards, type DifficultyGroup } from '@/lib/grammar-data';

type SwipeableCardProps = {
  cardId?: string;
  lastRating?: string;
  frontText: string;
  meaning?: string;
  connection?: string;
  example?: string;
  specialNote?: string;
  onReviewed?: () => void;
};

const reviewLabels: Record<Rating, string> = {
  [Rating.Manual]: '手動',
  [Rating.Again]: '再看一次',
  [Rating.Hard]: '困難',
  [Rating.Good]: '普通',
  [Rating.Easy]: '簡單',
};

export default function SwipeableCard({
  cardId,
  lastRating: initialLastRating,
  frontText,
  meaning = '—',
  connection = '—',
  example = '—',
  specialNote = '—',
  onReviewed,
}: SwipeableCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const controls = useAnimation();
  const scheduler = useMemo(() => fsrs(), []);
  const [srsData, setSrsData] = useState<Card>(createEmptyCard());
  const [lastRating, setLastRating] = useState<string>(initialLastRating ?? '尚未評分');

  useEffect(() => {
    setSrsData(createEmptyCard());
    setIsFlipped(false);
    setLastRating(initialLastRating ?? '尚未評分');
  }, [cardId, initialLastRating]);

  const handleDragEnd = async (_event: MouseEvent | TouchEvent | PointerEvent, info: { offset: { x: number; y: number } }) => {
    const swipeThreshold = 90;

    let rating: Rating | null = null;
    let nextDifficultyGroup: DifficultyGroup | null = null;

    if (info.offset.x < -swipeThreshold) {
      rating = Rating.Again;
    } else if (info.offset.x > swipeThreshold) {
      rating = Rating.Easy;
      nextDifficultyGroup = 'easy';
    } else if (info.offset.y < -swipeThreshold) {
      rating = Rating.Hard;
      nextDifficultyGroup = 'difficult';
    }

    if (!rating) {
      await controls.start({ x: 0, y: 0, transition: { type: 'spring', stiffness: 260, damping: 20 } });
      return;
    }

    const nextState = scheduler.next(srsData, new Date(), rating);
    setSrsData(nextState.card);

    const nextLastRating = nextDifficultyGroup ? `已標記為${nextDifficultyGroup === 'easy' ? '易卡' : '難卡'}` : reviewLabels[rating];
    setLastRating(nextLastRating);

    if (cardId) {
      const storedCards = getStoredGrammarCards().map((card) =>
        card.id === cardId
          ? {
              ...card,
              difficultyGroup: nextDifficultyGroup ?? card.difficultyGroup,
              lastRating: nextLastRating,
            }
          : card,
      );

      saveGrammarCards(storedCards);
    }

    await controls.start({
      x: info.offset.x * 1.5,
      y: info.offset.y * 1.5,
      opacity: 0,
      transition: { duration: 0.25 },
    });

    await controls.start({ x: 0, y: 0, opacity: 1, transition: { duration: 0.15 } });
    setIsFlipped(false);
    onReviewed?.();
  };

  return (
    <section className="flex flex-col items-center justify-center gap-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <motion.div
          drag={isFlipped ? true : false}
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          onDragEnd={handleDragEnd}
          animate={controls}
          onClick={() => setIsFlipped((current) => !current)}
          className="min-h-[420px] max-h-[70vh] cursor-pointer touch-none overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-950"
        >
          {!isFlipped ? (
            <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
              <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-bold tracking-[0.3em] text-blue-500">
                主動回憶
              </span>
              <h2 className="text-4xl font-bold text-slate-900 dark:text-white">{frontText}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                點擊後翻開解釋，再拖曳評分你的記憶表現。
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

              <div className="mt-6 grid grid-cols-3 gap-2 text-center text-xs font-bold text-slate-500 dark:text-slate-400">
                <span>← 再看一次</span>
                <span>難卡 ↑</span>
                <span>易卡 →</span>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        上次評分：<span className="font-semibold text-slate-900 dark:text-white">{lastRating}</span>
      </div>
    </section>
  );
}
