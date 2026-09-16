'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import GrammarEditModal from '@/components/grammar/GrammarEditModal';
import {
  getGrammarCardDraft,
  getStoredGrammarCards,
  saveGrammarCards,
  updateGrammarCard,
  type DifficultyGroup,
  type GrammarCard,
  type GrammarCardDraft,
} from '@/lib/grammar-data';

const EMPTY_FORM: GrammarCardDraft = {
  level: 'N5',
  pattern: '',
  meaning: '',
  connection: '',
  example: '',
  specialNote: '',
};

const DELETE_CONFIRMATION_TEXT = '刪除全部';

export default function GrammarBank() {
  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<GrammarCard[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_FORM);
  const [editTriggerElement, setEditTriggerElement] = useState<HTMLElement | null>(null);
  const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  useEffect(() => {
    const refreshCards = () => setCards(getStoredGrammarCards());
    refreshCards();

    window.addEventListener('grammar-cards-updated', refreshCards);
    return () => window.removeEventListener('grammar-cards-updated', refreshCards);
  }, []);

  const filteredCards = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return cards;
    }

    return cards.filter((card) => {
      const haystack = [card.pattern, card.meaning, card.level, card.example, card.specialNote]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [cards, query]);

  const handleDelete = (cardId: string) => {
    const nextCards = cards.filter((card) => card.id !== cardId);
    saveGrammarCards(nextCards);
  };

  const handleDeleteAll = () => {
    if (deleteConfirmation.trim() !== DELETE_CONFIRMATION_TEXT) {
      return;
    }

    saveGrammarCards([]);
    setEditingId(null);
    setDraft(EMPTY_FORM);
    setEditTriggerElement(null);
    setDeleteConfirmation('');
    setIsDeleteAllDialogOpen(false);
  };

  const handleEditStart = (card: GrammarCard, triggerElement?: HTMLElement) => {
    const currentCard = getStoredGrammarCards().find((storedCard) => storedCard.id === card.id) ?? card;

    setEditingId(currentCard.id);
    setDraft(getGrammarCardDraft(currentCard));
    setEditTriggerElement(triggerElement ?? null);
  };

  const handleSaveEdit = (cardId: string) => {
    const latestCards = getStoredGrammarCards();
    const nextCards = latestCards.map((card) =>
      card.id === cardId ? updateGrammarCard(card, draft) : card,
    );

    saveGrammarCards(nextCards);
    setEditingId(null);
    setDraft(EMPTY_FORM);
    setEditTriggerElement(null);
  };

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft(EMPTY_FORM);
    setEditTriggerElement(null);
  }, []);

  const handleDifficultyGroupChange = (cardId: string, nextGroup: DifficultyGroup) => {
    const latestCards = getStoredGrammarCards();
    const nextCards = latestCards.map((card) =>
      card.id === cardId
        ? {
            ...card,
            difficultyGroup: nextGroup,
          }
        : card,
    );

    saveGrammarCards(nextCards);
  };

  return (
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">文法庫</h2>
          <p className="text-xs text-slate-600 dark:text-slate-300 sm:text-sm">
            可依等級、意思、範例句或詳細說明搜尋句型，並在同一張卡片上編輯內容。
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜尋文法點"
            className="rounded-full border border-slate-300 bg-slate-50 px-4 py-2 text-sm outline-none ring-0 transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
          <button
            type="button"
            disabled={cards.length === 0}
            onClick={() => {
              setDeleteConfirmation('');
              setIsDeleteAllDialogOpen(true);
            }}
            className="rounded-full border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
          >
            刪除全部文法
          </button>
        </div>
      </div>

      {isDeleteAllDialogOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-all-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setDeleteConfirmation('');
              setIsDeleteAllDialogOpen(false);
            }
          }}
          className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30"
        >
          <h3 id="delete-all-title" className="font-bold text-rose-900 dark:text-rose-200">
            確定要刪除全部文法嗎？
          </h3>
          <p className="mt-1 text-sm text-rose-800 dark:text-rose-300">
            這會清空目前裝置上的所有文法卡片，且無法復原。請輸入「{DELETE_CONFIRMATION_TEXT}」以確認。
          </p>
          <input
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            placeholder={DELETE_CONFIRMATION_TEXT}
            aria-label="刪除全部確認文字"
            className="mt-3 w-full rounded-xl border border-rose-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-500 dark:border-rose-800 dark:bg-slate-950 dark:text-slate-100"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={deleteConfirmation.trim() !== DELETE_CONFIRMATION_TEXT}
              onClick={handleDeleteAll}
              className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              確認刪除
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteConfirmation('');
                setIsDeleteAllDialogOpen(false);
              }}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {filteredCards.map((card) => (
          <article
            key={card.id}
            className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-300">
                {card.level}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                {card.pattern}
              </span>
            </div>

            <h3 className="mt-2 text-base font-bold text-slate-900 dark:text-white">{card.meaning}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{card.example}</p>
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-700 dark:text-slate-200">詳細說明：</span>{' '}
              {card.specialNote || '未填寫'}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Link
                href="/#practice"
                className="inline-flex rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                練習這張卡片
              </Link>
              <button
                type="button"
                onClick={(event) => handleEditStart(card, event.currentTarget)}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                編輯
              </button>
              <button
                type="button"
                onClick={() => handleDelete(card.id)}
                className="rounded-full border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:border-rose-800 dark:text-rose-300"
              >
                刪除
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleDifficultyGroupChange(card.id, 'difficult')}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  card.difficultyGroup === 'difficult'
                    ? 'bg-rose-500 text-white'
                    : 'border border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300'
                }`}
              >
                難卡
              </button>
              <button
                type="button"
                onClick={() => handleDifficultyGroupChange(card.id, 'easy')}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  card.difficultyGroup === 'easy'
                    ? 'bg-emerald-500 text-white'
                    : 'border border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300'
                }`}
              >
                易卡
              </button>
            </div>
          </article>
        ))}
      </div>

      {filteredCards.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
          {cards.length === 0 ? '目前沒有文法卡片，請新增或從 GitHub 下載。' : '找不到符合搜尋條件的文法。'}
        </p>
      ) : null}

      {editingId && draft ? (
        <GrammarEditModal
          draft={draft}
          title={(() => {
            const editingCard = cards.find((card) => card.id === editingId);
            return editingCard ? `${editingCard.level} · ${editingCard.pattern}` : '編輯文法卡片';
          })()}
          description="儲存後會保留這張卡片的標籤與複習狀態。"
          onChange={setDraft}
          onSave={() => handleSaveEdit(editingId)}
          onCancel={handleCancelEdit}
          returnFocusElement={editTriggerElement}
        />
      ) : null}
    </section>
  );
}
