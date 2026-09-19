'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getGrammarCardDraft,
  getStoredGrammarCards,
  clearPendingRemoteCardSync,
  hasPendingRemoteCardSync,
  saveGrammarCards,
  updateGrammarCard,
  type GrammarCard,
  type GrammarCardDraft,
} from '@/lib/grammar-data';
import GrammarEditModal from '@/components/grammar/GrammarEditModal';
import { getGithubSyncConfig, uploadGrammarCardsToGithub } from '@/lib/github-sync';
import SwipeableCard from '@/components/srs/SwipeableCard';
import CopilotPanel from '@/components/copilot/CopilotPanel';
import { getRemoteGrammarCards, saveRemoteGrammarCards } from '@/components/copilot/copilot-api';
import type { GrammarMutationProposal } from '@/lib/copilot-context';

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
    return '已掌握';
  }

  if (label === 'difficult') {
    return '未掌握';
  }

  return '未標籤';
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
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<GrammarCardDraft | null>(null);
  const [editTriggerElement, setEditTriggerElement] = useState<HTMLElement | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncNeedsConfig, setSyncNeedsConfig] = useState(false);

  useEffect(() => {
    const refreshQueue = () => {
      const nextQueue = getStoredGrammarCards();
      setQueue(nextQueue);
      setShuffleOrder((current) =>
        current ? current.filter((cardId) => nextQueue.some((card) => card.id === cardId)) : current,
      );
    };
    refreshQueue();

    const syncRemoteCards = async () => {
      if (hasPendingRemoteCardSync()) {
        const result = await saveRemoteGrammarCards(getStoredGrammarCards());
        if (result) {
          clearPendingRemoteCardSync();
          refreshQueue();
        }
        return;
      }

      const result = await getRemoteGrammarCards();
      if (!result) return;
      saveGrammarCards(result.cards, { sync: false });
      refreshQueue();
    };

    void syncRemoteCards().catch(() => undefined);

    window.addEventListener('grammar-cards-updated', refreshQueue);
    window.addEventListener('auth-state-changed', syncRemoteCards);
    return () => {
      window.removeEventListener('grammar-cards-updated', refreshQueue);
      window.removeEventListener('auth-state-changed', syncRemoteCards);
    };
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

  const handleAdvance = useCallback(() => {
    if (filteredQueue.length === 0) {
      return;
    }

    setActiveIndex((current) => (current + 1) % filteredQueue.length);
  }, [filteredQueue.length]);

  const handlePrevious = useCallback(() => {
    if (filteredQueue.length === 0) {
      return;
    }

    setActiveIndex((current) => (current - 1 + filteredQueue.length) % filteredQueue.length);
  }, [filteredQueue.length]);

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
    const latestCards = getStoredGrammarCards();
    const hasAnyLabel = latestCards.some(
      (card) => card.difficultyGroup === 'easy' || card.difficultyGroup === 'difficult',
    );

    if (!hasAnyLabel) {
      return;
    }

    const nextCards = latestCards.map((card) => ({
      ...card,
      difficultyGroup: undefined,
    }));

    saveGrammarCards(nextCards);
    setPile('untagged');
    setActiveIndex(0);
  };

  const handleLabelCard = useCallback((nextLabel: Exclude<ReviewPile, 'all'>) => {
    if (!activeCard) {
      return;
    }

    const nextDifficultyGroup: GrammarCard['difficultyGroup'] =
      nextLabel === 'easy' ? 'easy' : nextLabel === 'difficult' ? 'difficult' : undefined;

    const latestCards = getStoredGrammarCards();
    const nextCards = latestCards.map((card) =>
      card.id === activeCard.id
        ? {
            ...card,
            difficultyGroup: nextDifficultyGroup,
          }
        : card,
    );

    saveGrammarCards(nextCards);
    handleAdvance();
  }, [activeCard, handleAdvance]);

  const handleStartEdit = useCallback((triggerElement?: HTMLElement) => {
    if (!activeCard) {
      return;
    }

    const currentCard = getStoredGrammarCards().find((card) => card.id === activeCard.id) ?? activeCard;
    setEditingCardId(currentCard.id);
    setEditDraft(getGrammarCardDraft(currentCard));
    setEditTriggerElement(triggerElement ?? null);
  }, [activeCard]);

  const handleCancelEdit = useCallback(() => {
    setEditingCardId(null);
    setEditDraft(null);
    setEditTriggerElement(null);
  }, []);

  const handleSaveEdit = useCallback((moveToNext = false) => {
    if (!editingCardId || !editDraft) {
      return;
    }

    const latestCards = getStoredGrammarCards();
    const nextCards = latestCards.map((card) =>
      card.id === editingCardId ? updateGrammarCard(card, editDraft) : card,
    );

    saveGrammarCards(nextCards);
    handleCancelEdit();

    if (moveToNext) {
      handleAdvance();
    }
  }, [editDraft, editingCardId, handleAdvance, handleCancelEdit]);

  const handleQuickBackup = useCallback(async () => {
    setIsBackingUp(true);
    setSyncMessage('');
    setSyncNeedsConfig(false);

    try {
      const result = await uploadGrammarCardsToGithub();
      setLastSyncedAt(new Date().toLocaleTimeString('zh-Hant', { hour: '2-digit', minute: '2-digit' }));
      setSyncMessage(`已備份至 GitHub，Gist 識別碼：${result.gistId}`);
    } catch (error) {
      setSyncNeedsConfig(!getGithubSyncConfig().token.trim());
      setSyncMessage(error instanceof Error ? error.message : 'GitHub 備份失敗。');
    } finally {
      setIsBackingUp(false);
    }
  }, []);

  const handleApplyCopilotProposal = useCallback((proposal: GrammarMutationProposal) => {
    const latestCards = getStoredGrammarCards();

    if (proposal.type === 'edit') {
      const nextCards = latestCards.map((card) => {
        if (card.id !== proposal.cardId) {
          return card;
        }

        const nextCard: GrammarCard = {
          ...card,
          ...proposal.changes,
          difficultyGroup:
            proposal.changes.difficultyGroup === null
              ? undefined
              : proposal.changes.difficultyGroup ?? card.difficultyGroup,
        };
        return {
          ...nextCard,
          frontText: nextCard.pattern,
          backExplanation: `${nextCard.meaning}｜${nextCard.connection}｜${nextCard.example}`,
        };
      });
      saveGrammarCards(nextCards);
      return;
    }

    const id = globalThis.crypto?.randomUUID?.() ?? `grammar-${Date.now()}`;
    const card = {
      id,
      ...proposal.card,
      frontText: proposal.card.pattern,
      backExplanation: `${proposal.card.meaning}｜${proposal.card.connection}｜${proposal.card.example}`,
    };
    saveGrammarCards([...latestCards, card]);
  }, []);

  useEffect(() => {
    const handleKeyboardShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, button')) {
        return;
      }

      if (event.key === ' ') {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('swipeable-card-toggle'));
      } else if (event.key === 'ArrowLeft') {
        handlePrevious();
      } else if (event.key === 'ArrowRight') {
        handleAdvance();
      } else if (event.key === '1') {
        handleLabelCard('easy');
      } else if (event.key === '2') {
        handleLabelCard('difficult');
      } else if (event.key === '0') {
        handleLabelCard('untagged');
      } else if (event.key.toLowerCase() === 'e') {
        handleStartEdit();
      } else if (event.key.toLowerCase() === 's') {
        void handleQuickBackup();
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcut);
    return () => window.removeEventListener('keydown', handleKeyboardShortcut);
  }, [activeCard, handleAdvance, handleLabelCard, handlePrevious, handleQuickBackup, handleStartEdit]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
              複習統計
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">複習統計</h3>
          </div>
          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white dark:bg-blue-500">
            總卡數 {reviewStats.total}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-800/60">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-700 dark:text-slate-200">
              未標籤
            </p>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{reviewStats.untagged}</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-3 dark:bg-emerald-950/40">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
              已掌握
            </p>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{reviewStats.easy}</p>
          </div>
          <div className="rounded-2xl bg-rose-50 p-3 dark:bg-rose-950/40">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300">
              未掌握
            </p>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{reviewStats.difficult}</p>
          </div>
        </div>

          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[34rem] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="grid grid-cols-[4rem_repeat(3,minmax(0,1fr))] bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <div className="px-3 py-2">等級</div>
                <div className="px-3 py-2 text-center">未標籤</div>
                <div className="px-3 py-2 text-center">已掌握</div>
                <div className="px-3 py-2 text-center">未掌握</div>
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
            目前分類：{pile === 'all' ? '全部' : getLabelText(pile)} · 等級：
            {selectedLevels.length === 0 ? '全部' : selectedLevels.join('、')}
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
            { key: 'all', label: '全部' },
            { key: 'untagged', label: '未標籤' },
            { key: 'easy', label: '已掌握' },
            { key: 'difficult', label: '未掌握' },
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
              等級篩選
            </span>
            <span className="text-xs text-slate-600 dark:text-slate-300">
              {selectedLevels.length === 0 ? '全部等級' : `${selectedLevels.length} 個等級`}
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

          <div className="sticky bottom-3 z-10 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
            <button
              type="button"
              onClick={(event) => handleStartEdit(event.currentTarget)}
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white dark:bg-blue-500"
            >
              編輯卡片
            </button>
            <button
              type="button"
              onClick={() => void handleQuickBackup()}
              disabled={isBackingUp}
              aria-busy={isBackingUp}
              className="rounded-xl border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-800 dark:text-blue-200"
            >
              {isBackingUp ? '備份中……' : '備份至 GitHub'}
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <div>
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:justify-center">
                <div className="min-w-0 flex-1">
                  <SwipeableCard
                    key={`${activeCard.id}-${activeCard.pattern}`}
                    frontText={activeCard.frontText}
                    meaning={activeCard.meaning}
                    connection={activeCard.connection}
                    example={activeCard.example}
                    specialNote={activeCard.specialNote}
                  />
                </div>
                <CopilotPanel activeCard={activeCard} onApplyProposal={handleApplyCopilotProposal} />
              </div>
            </div>

            <div className="space-y-4 lg:sticky lg:top-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={(event) => handleStartEdit(event.currentTarget)}
                    className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white dark:bg-blue-500"
                  >
                    編輯卡片
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleQuickBackup()}
                    disabled={isBackingUp}
                    aria-busy={isBackingUp}
                    className="rounded-xl border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-800 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-800 dark:text-blue-200 dark:hover:bg-blue-950/40"
                  >
                    {isBackingUp ? '備份中……' : '備份至 GitHub'}
                  </button>
                </div>
                {lastSyncedAt ? (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">上次備份：{lastSyncedAt}</p>
                ) : null}
                {syncMessage ? (
                  <div aria-live="polite" className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
                    <p>{syncMessage}</p>
                    {syncNeedsConfig ? (
                      <a href="#github-sync" className="mt-1 inline-block font-semibold underline">
                        前往 GitHub 設定
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-sm text-slate-600 dark:text-slate-300">用按鈕標記卡片，完成後會自動前往下一張。</p>
                <div className="mt-3 grid gap-2">
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
                    標記為已掌握
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLabelCard('difficult')}
                    className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 transition hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60"
                  >
                    標記為未掌握
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {queue.length === 0 ? '目前沒有文法卡片。' : '沒有符合目前篩選條件的卡片。'}
        </div>
      )}

      {editingCardId && editDraft ? (
        <GrammarEditModal
          draft={editDraft}
          title={activeCard ? `${activeCard.level} · ${activeCard.pattern}` : '編輯文法卡片'}
          description="儲存後會保留這張卡片的標籤與複習狀態。"
          onChange={setEditDraft}
          onSave={() => handleSaveEdit()}
          onSaveAndNext={() => handleSaveEdit(true)}
          onCancel={handleCancelEdit}
          returnFocusElement={editTriggerElement}
        />
      ) : null}
    </div>
  );
}
