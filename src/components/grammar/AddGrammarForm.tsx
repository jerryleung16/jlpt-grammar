'use client';

import { FormEvent, useState } from 'react';
import { getStoredGrammarCards, saveGrammarCards, type GrammarCard } from '@/lib/grammar-data';

const initialState = {
  level: 'N5',
  pattern: '',
  meaning: '',
  connection: '',
  example: '',
  specialNote: '',
};

function parseBatchInput(batchText: string): GrammarCard[] {
  return batchText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const normalizedLine = line.replaceAll('｜', '|');
      const parts = normalizedLine
        .split('|')
        .map((part) => part.trim())
        .filter(Boolean);

      const [level, pattern, meaning, connection, example, specialNote] = parts;

      return {
        id: `batch-${Date.now()}-${index}`,
        level: level || 'N5',
        pattern: pattern || '未命名句型',
        meaning: meaning || '未填寫意思',
        connection: connection || '未填寫接続',
        example: example || '未填寫例句',
        specialNote: specialNote || '未填寫特別說明',
        frontText: pattern || '未命名句型',
        backExplanation: `${meaning || '未填寫意思'}｜${connection || '未填寫接続'}｜${example || '未填寫例句'}`,
      };
    });
}

export default function AddGrammarForm() {
  const [form, setForm] = useState(initialState);
  const [batchText, setBatchText] = useState('');
  const [message, setMessage] = useState('');
  const [entryMode, setEntryMode] = useState<'single' | 'batch'>('single');
  const batchLineCount = batchText.split(/\r?\n/).filter(Boolean).length;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (entryMode === 'batch') {
      const parsedBatchCards = parseBatchInput(batchText);

      if (parsedBatchCards.length === 0) {
        setMessage('批量輸入區為空，請先貼入要新增的文法內容。');
        return;
      }

      const cards = [...parsedBatchCards, ...getStoredGrammarCards()];
      saveGrammarCards(cards);
      setBatchText('');
      setMessage(`已批量新增 ${parsedBatchCards.length} 張文法卡片。`);
      return;
    }

    const nextCard: GrammarCard = {
      id: `custom-${Date.now()}`,
      level: form.level,
      pattern: form.pattern.trim(),
      meaning: form.meaning.trim(),
      connection: form.connection.trim(),
      example: form.example.trim(),
      specialNote: form.specialNote.trim(),
      frontText: form.pattern.trim(),
      backExplanation: `${form.meaning.trim()}｜${form.connection.trim()}｜${form.example.trim()}`,
    };

    const isSingleCardValid = nextCard.pattern && nextCard.meaning && nextCard.example;

    if (!isSingleCardValid) {
      setMessage('請至少填寫句型、意思與例句。');
      return;
    }

    const cards = [nextCard, ...getStoredGrammarCards()];
    saveGrammarCards(cards);
    setForm(initialState);
    setMessage('已新增文法卡片，會立即出現在文法庫與複習清單中。');
  };

  return (
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">新增文法</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        直接在網站上新增文法項目，新增後會同步進入文法庫與複習隊列。
      </p>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEntryMode('single')}
            aria-pressed={entryMode === 'single'}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              entryMode === 'single'
                ? 'bg-slate-900 text-white dark:bg-blue-500'
                : 'border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'
            }`}
          >
            單字新增
          </button>
          <button
            type="button"
            onClick={() => setEntryMode('batch')}
            aria-pressed={entryMode === 'batch'}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              entryMode === 'batch'
                ? 'bg-slate-900 text-white dark:bg-blue-500'
                : 'border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'
            }`}
          >
            批量新增
          </button>
        </div>

        {entryMode === 'single' ? (
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-700 dark:text-slate-200">
              <span>等級</span>
              <select
                value={form.level}
                onChange={(event) => setForm((current) => ({ ...current, level: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none dark:border-slate-700 dark:bg-slate-950"
              >
                <option>N5</option>
                <option>N4</option>
                <option>N3</option>
                <option>N2</option>
                <option>N1</option>
              </select>
            </label>

            <label className="space-y-1 text-sm text-slate-700 dark:text-slate-200">
              <span>句型</span>
              <input
                value={form.pattern}
                onChange={(event) => setForm((current) => ({ ...current, pattern: event.target.value }))}
                placeholder="例如：〜ている"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none dark:border-slate-700 dark:bg-slate-950"
              />
            </label>

            <label className="space-y-1 text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
              <span>意思</span>
              <textarea
                value={form.meaning}
                onChange={(event) => setForm((current) => ({ ...current, meaning: event.target.value }))}
                placeholder="說明這個句型的意思"
                rows={3}
                className="min-h-24 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none dark:border-slate-700 dark:bg-slate-950"
              />
            </label>

            <label className="space-y-1 text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
              <span>接続</span>
              <textarea
                value={form.connection}
                onChange={(event) => setForm((current) => ({ ...current, connection: event.target.value }))}
                placeholder="例如：V-て形 + いる"
                rows={3}
                className="min-h-24 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none dark:border-slate-700 dark:bg-slate-950"
              />
            </label>

            <label className="space-y-1 text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
              <span>例句</span>
              <textarea
                value={form.example}
                onChange={(event) => setForm((current) => ({ ...current, example: event.target.value }))}
                placeholder="例如：彼は本を読んでいる。"
                rows={3}
                className="min-h-24 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none dark:border-slate-700 dark:bg-slate-950"
              />
            </label>

            <label className="space-y-1 text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
              <span>特別說明</span>
              <textarea
                value={form.specialNote}
                onChange={(event) => setForm((current) => ({ ...current, specialNote: event.target.value }))}
                placeholder="補充說明、常見錯誤、延伸用法"
                rows={4}
                className="min-h-28 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
          </div>
        ) : (
          <div className="space-y-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/60">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-blue-500">
                已輸入 {batchLineCount} 行 / {batchLineCount} 張卡
              </span>
            </div>

            <p className="text-sm text-slate-700 dark:text-slate-200">
              批量新增說明：每一行都代表一張文法卡，欄位請依照「等級 | 句型 | 意思 | 接続 | 例句 | 特別說明」的順序填寫。
            </p>

            <textarea
              value={batchText}
              onChange={(event) => setBatchText(event.target.value)}
              placeholder="N5 | 〜ている | 正在進行的動作 | V-て形 + いる | 彼は本を読んでいる。 | 描述持續動作"
              rows={10}
              className="min-h-40 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="submit"
            className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            {entryMode === 'batch' ? '批量新增文法卡片' : '新增文法卡片'}
          </button>

          {message ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-300">{message}</p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
