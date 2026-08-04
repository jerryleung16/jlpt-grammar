'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getStoredGrammarCards, saveGrammarCards, type DifficultyGroup, type GrammarCard } from '@/lib/grammar-data';

const EMPTY_FORM = {
  level: 'N5',
  pattern: '',
  meaning: '',
  connection: '',
  example: '',
  specialNote: '',
};

export default function GrammarBank() {
  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<GrammarCard[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_FORM);

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
      const haystack = [card.pattern, card.meaning, card.level, card.example].join(' ').toLowerCase();
      return haystack.includes(normalized);
    });
  }, [cards, query]);

  const handleDelete = (cardId: string) => {
    const nextCards = cards.filter((card) => card.id !== cardId);
    saveGrammarCards(nextCards);
  };

  const handleEditStart = (card: GrammarCard) => {
    setEditingId(card.id);
    setDraft({
      level: card.level,
      pattern: card.pattern,
      meaning: card.meaning,
      connection: card.connection,
      example: card.example,
      specialNote: card.specialNote,
    });
  };

  const handleSaveEdit = (cardId: string) => {
    const nextCards = cards.map((card) =>
      card.id === cardId
        ? {
            ...card,
            level: draft.level,
            pattern: draft.pattern,
            meaning: draft.meaning,
            connection: draft.connection,
            example: draft.example,
            specialNote: draft.specialNote,
            frontText: draft.pattern,
            backExplanation: `${draft.meaning}｜${draft.connection}｜${draft.example}`,
          }
        : card,
    );

    saveGrammarCards(nextCards);
    setEditingId(null);
    setDraft(EMPTY_FORM);
  };

  const handleDifficultyGroupChange = (cardId: string, nextGroup?: DifficultyGroup) => {
    const nextCards = cards.map((card) =>
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
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">文法庫</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            可依等級、意思或範例句搜尋句型，並手動編輯／刪除／分類難易卡。
          </p>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜尋文法點"
          className="rounded-full border border-slate-300 bg-slate-50 px-4 py-2 text-sm outline-none ring-0 transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {filteredCards.map((card) => (
          <article
            key={card.id}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-300">
                {card.level}
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                {card.pattern}
              </span>
            </div>

            {editingId === card.id ? (
              <div className="mt-3 space-y-2">
                <input
                  value={draft.pattern}
                  onChange={(event) => setDraft((current) => ({ ...current, pattern: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                <textarea
                  value={draft.meaning}
                  onChange={(event) => setDraft((current) => ({ ...current, meaning: event.target.value }))}
                  rows={2}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                <textarea
                  value={draft.connection}
                  onChange={(event) => setDraft((current) => ({ ...current, connection: event.target.value }))}
                  rows={2}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                <textarea
                  value={draft.example}
                  onChange={(event) => setDraft((current) => ({ ...current, example: event.target.value }))}
                  rows={2}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(card.id)}
                    className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-blue-500"
                  >
                    儲存
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">{card.meaning}</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{card.example}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/practice"
                    className="inline-flex rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    練習這張卡片
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleEditStart(card)}
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
                <div className="mt-3 flex flex-wrap gap-2">
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
                  <button
                    type="button"
                    onClick={() => handleDifficultyGroupChange(card.id, undefined)}
                    className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                  >
                    取消標記
                  </button>
                </div>
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
