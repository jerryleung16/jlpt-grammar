'use client';

import type { KeyboardEvent } from 'react';
import type { GrammarCardDraft } from '@/lib/grammar-data';

type InlineGrammarEditorProps = {
  draft: GrammarCardDraft;
  onChange: (draft: GrammarCardDraft) => void;
  onSave: () => void;
  onSaveAndNext?: () => void;
  onCancel: () => void;
};

const LEVEL_OPTIONS = ['N1', 'N2', 'N3', 'N4', 'N5'];

export default function InlineGrammarEditor({
  draft,
  onChange,
  onSave,
  onSaveAndNext,
  onCancel,
}: InlineGrammarEditorProps) {
  const updateField = <Field extends keyof GrammarCardDraft>(field: Field, value: GrammarCardDraft[Field]) => {
    onChange({ ...draft, [field]: value });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      onCancel();
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      onSave();
    }
  };

  return (
    <div
      className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900 dark:bg-blue-950/30"
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-blue-700 dark:text-blue-300">快速編輯</p>
          <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">編輯目前卡片</h3>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
        >
          取消
        </button>
      </div>

      <div className="mt-3 grid gap-2">
        <label className="space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <span>等級</span>
          <select
            value={draft.level}
            onChange={(event) => updateField('level', event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {LEVEL_OPTIONS.map((level) => <option key={level}>{level}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <span>句型</span>
          <input
            value={draft.pattern}
            onChange={(event) => updateField('pattern', event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        <label className="space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <span>意思</span>
          <textarea
            value={draft.meaning}
            onChange={(event) => updateField('meaning', event.target.value)}
            rows={2}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        <label className="space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <span>接続</span>
          <textarea
            value={draft.connection}
            onChange={(event) => updateField('connection', event.target.value)}
            rows={2}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        <label className="space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <span>例句</span>
          <textarea
            value={draft.example}
            onChange={(event) => updateField('example', event.target.value)}
            rows={2}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        <label className="space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <span>特別說明</span>
          <textarea
            value={draft.specialNote}
            onChange={(event) => updateField('specialNote', event.target.value)}
            rows={3}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white dark:bg-blue-500"
        >
          儲存變更
        </button>
        {onSaveAndNext ? (
          <button
            type="button"
            onClick={onSaveAndNext}
            className="rounded-xl border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-800 dark:border-blue-800 dark:text-blue-200"
          >
            儲存並下一張
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">按 Ctrl/Cmd + Enter 儲存，按 Esc 取消。</p>
    </div>
  );
}