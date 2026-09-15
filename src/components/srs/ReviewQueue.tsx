'use client';

import { useEffect, useMemo, useState } from 'react';
import { getStoredGrammarCards, saveGrammarCards, type GrammarCard } from '@/lib/grammar-data';
import SwipeableCard from '@/components/srs/SwipeableCard';

type ReviewPile = 'all' | 'untagged' | 'easy' | 'difficult';
const LEVEL_OPTIONS = ['N1', 'N2', 'N3', 'N4', 'N5'] as const;

type LevelStat = {
  level: (typeof LEVEL_OPTIONS)[number];
  untagged: number;
  easy: number;
  difficult: number;
};

function getLabel(card: GrammarCard): Exclude<ReviewPile, 'all'> {
  if (card.difficultyGroup === 'easy') {
    return 'easy';
  }

  if (card.difficultyGroup === 'difficult') {
    return 'difficult';
  }

  return 'untagged';
}

function getLabelText(label: Exclude<ReviewPile, 'all'>): string {
  if (label === 'easy') {
    return 'I know';
  }

  if (label === 'difficult') {
    return "I don't know";
  }

  return 'Unlabelled';
}

function shuffleCardIds(cards: GrammarCard[]): string[] {
  const shuffledIds = cards.map((card) => card.id);

  for (let index = shuffledIds.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffledIds[index], shuffledIds[randomIndex]] = [shuffledIds[randomIndex], shuffledIds[index]];
  }

  return shuffledIds;
}

export default function ReviewQueue() {
  const [queue, setQueue] = useState<GrammarCard[]>([]);
  const [shuffleOrder, setShuffleOrder] = useState<string[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pile, setPile] = useState<ReviewPile>('untagged');
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);

  useEffect(() => {
    const refreshQueue = () => {
      const nextQueue = getStoredGrammarCards();
      setQueue(nextQueue);
      setShuffleOrder((current) =>
        current ? current.filter((cardId) => nextQueue.some((card) => card.id === cardId)) : current,
      );
    };
    refreshQueue();

    window.addEventListener('grammar-cards-updated', refreshQueue);
    return () => window.removeEventListener('grammar-cards-updated', refreshQueue);
  }, []);

  const reviewStats = useMemo(() => {
    const easyCount = queue.filter((card) => getLabel(card) === 'easy').length;
    const difficultCount = queue.filter((card) => getLabel(card) === 'difficult').length;
    const untaggedCount = queue.filter((card) => getLabel(card) === 'untagged').length;

    return {
      total: queue.length,
      untagged: untaggedCount,
      easy: easyCount,
      difficult: difficultCount,
    };
  }, [queue]);

  const levelStats = useMemo<LevelStat[]>(
    () =>
      LEVEL_OPTIONS.map((level) => {
        const cardsAtLevel = queue.filter((card) => card.level === level);

        return {
          level,
          untagged: cardsAtLevel.filter((card) => getLabel(card) === 'untagged').length,
          easy: cardsAtLevel.filter((card) => getLabel(card) === 'easy').length,
          difficult: cardsAtLevel.filter((card) => getLabel(card) === 'difficult').length,
        };
      }),
    [queue],
  );

  const orderedQueue = useMemo(() => {
    if (!shuffleOrder) {
      return queue;
    }

    const cardsById = new Map(queue.map((card) => [card.id, card]));
    const shuffledCards = shuffleOrder
      .map((cardId) => cardsById.get(cardId))
      .filter((card): card is GrammarCard => Boolean(card));
    const shuffledIds = new Set(shuffleOrder);

    return [...shuffledCards, ...queue.filter((card) => !shuffledIds.has(card.id))];
  }, [queue, shuffleOrder]);

  const filteredQueue = useMemo(() => {
    const byPile = pile === 'all' ? orderedQueue : orderedQueue.filter((card) => getLabel(card) === pile);
    return byPile.filter((card) => selectedLevels.length === 0 || selectedLevels.includes(card.level));
  }, [orderedQueue, pile, selectedLevels]);

  const activeCard = useMemo(() => {
    if (filteredQueue.length === 0) {
      return null;
    }

    return filteredQueue[activeIndex % filteredQueue.length];
  }, [activeIndex, filteredQueue]);

  const handleAdvance = () => {
    if (filteredQueue.length === 0) {
      return;
    }

    setActiveIndex((current) => (current + 1) % filteredQueue.length);
  };

  const handlePrevious = () => {
    if (filteredQueue.length === 0) {
      return;
    }

    setActiveIndex((current) => (current - 1 + filteredQueue.length) % filteredQueue.length);
  };

  const toggleLevel = (level: string) => {
    setSelectedLevels((current) =>
      current.includes(level) ? current.filter((item) => item !== level) : [...current, level],
    );
    setActiveIndex(0);
  };

  const handlePileChange = (nextPile: ReviewPile) => {
    setPile(nextPile);
    setActiveIndex(0);
  };

  const handleShuffle = () => {
    if (orderedQueue.length === 0) {
      return;
    }

    setShuffleOrder(shuffleCardIds(orderedQueue));
    setActiveIndex(0);
  };

  const handleResetOrder = () => {
    setShuffleOrder(null);
    setActiveIndex(0);
  };

  const handleClearAllLabels = () => {
    const hasAnyLabel = queue.some((card) => card.difficultyGroup === 'easy' || card.difficultyGroup === 'difficult');

    if (!hasAnyLabel) {
      return;
    }

    const nextCards = queue.map((card) => ({
      ...card,
      difficultyGroup: undefined,
    }));

    saveGrammarCards(nextCards);
    setPile('untagged');
    setActiveIndex(0);
  };

  const handleLabelCard = (nextLabel: Exclude<ReviewPile, 'all'>) => {
    if (!activeCard) {
      return;
    }

    const nextDifficultyGroup: GrammarCard['difficultyGroup'] =
      nextLabel === 'easy' ? 'easy' : nextLabel === 'difficult' ? 'difficult' : undefined;

    const nextCards = queue.map((card) =>
      card.id === activeCard.id
        ? {
            ...card,
            difficultyGroup: nextDifficultyGroup,
          }
        : card,
    );

    saveGrammarCards(nextCards);
    handleAdvance();
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
            Total {reviewStats.total}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-800/60">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-700 dark:text-slate-200">
              Unlabelled
            </p>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{reviewStats.untagged}</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-3 dark:bg-emerald-950/40">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
              I know
            </p>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{reviewStats.easy}</p>
          </div>
          <div className="rounded-2xl bg-rose-50 p-3 dark:bg-rose-950/40">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300">
              I don&apos;t know
            </p>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{reviewStats.difficult}</p>
          </div>
        </div>

          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[34rem] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="grid grid-cols-[4rem_repeat(3,minmax(0,1fr))] bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <div className="px-3 py-2">Level</div>
                <div className="px-3 py-2 text-center">Unlabelled</div>
                <div className="px-3 py-2 text-center">I know</div>
                <div className="px-3 py-2 text-center">I don&apos;t know</div>
              </div>
              {levelStats.map((stat) => (
                <div
                  key={stat.level}
                  className="grid grid-cols-[4rem_repeat(3,minmax(0,1fr))] border-t border-slate-200 text-sm dark:border-slate-700"
                >
                  <div className="px-3 py-2 font-bold text-slate-900 dark:text-white">{stat.level}</div>
                  <div className="px-3 py-2 text-center text-slate-600 dark:text-slate-300">{stat.untagged}</div>
                  <div className="px-3 py-2 text-center text-emerald-700 dark:text-emerald-300">{stat.easy}</div>
                  <div className="px-3 py-2 text-center text-rose-700 dark:text-rose-300">{stat.difficult}</div>
                </div>
              ))}
            </div>
          </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Current pile: {pile === 'all' ? 'All' : getLabelText(pile)} · Levels:
            {selectedLevels.length === 0 ? 'All' : selectedLevels.join(', ')}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleClearAllLabels}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              清除所有標籤
            </button>
            <button
              type="button"
              onClick={handleShuffle}
              disabled={orderedQueue.length < 2}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {shuffleOrder ? '重新洗牌' : '洗牌'}
            </button>
            <button
              type="button"
              onClick={handleResetOrder}
              disabled={!shuffleOrder}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              原始順序
            </button>
            <button
              type="button"
              onClick={handlePrevious}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              上一張
            </button>
            <button
              type="button"
              onClick={handleAdvance}
              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-blue-500"
            >
              下一張
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
            {[
            { key: 'all', label: 'All' },
            { key: 'untagged', label: 'Unlabelled' },
            { key: 'easy', label: 'I know' },
            { key: 'difficult', label: "I don't know" },
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => handlePileChange(option.key as ReviewPile)}
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
              {selectedLevels.length === 0 ? 'All levels' : `${selectedLevels.length} levels`}
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
        <>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
            目前標籤：
            <span className="ml-1 font-semibold text-slate-900 dark:text-white">{getLabelText(getLabel(activeCard))}</span>
          </div>

          <SwipeableCard
            key={`${activeCard.id}-${activeCard.pattern}`}
            frontText={activeCard.frontText}
            meaning={activeCard.meaning}
            connection={activeCard.connection}
            example={activeCard.example}
            specialNote={activeCard.specialNote}
          />

          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm text-slate-600 dark:text-slate-300">用按鈕標記卡片，點擊後會自動前往下一張。</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => handleLabelCard('untagged')}
                className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                標記為未標籤
              </button>
              <button
                type="button"
                onClick={() => handleLabelCard('easy')}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
              >
                標記為易卡
              </button>
              <button
                type="button"
                onClick={() => handleLabelCard('difficult')}
                className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 transition hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60"
              >
                標記為難卡
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {queue.length === 0 ? 'No grammar cards available.' : 'No cards match the current filters.'}
        </div>
      )}
    </div>
  );
}
