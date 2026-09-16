'use client';

import { useEffect, useRef } from 'react';
import InlineGrammarEditor from '@/components/grammar/InlineGrammarEditor';
import type { GrammarCardDraft } from '@/lib/grammar-data';

type GrammarEditModalProps = {
  draft: GrammarCardDraft;
  title: string;
  description?: string;
  onChange: (draft: GrammarCardDraft) => void;
  onSave: () => void;
  onSaveAndNext?: () => void;
  onCancel: () => void;
  returnFocusElement?: HTMLElement | null;
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]';

export default function GrammarEditModal({
  draft,
  title,
  description,
  onChange,
  onSave,
  onSaveAndNext,
  onCancel,
  returnFocusElement,
}: GrammarEditModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;

    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== 'Tab' || !dialog) {
        return;
      }

      const focusableElements = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      if (returnFocusElement?.isConnected) {
        returnFocusElement.focus();
      }
    };
  }, [onCancel, returnFocusElement]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="grammar-edit-title"
        aria-describedby={description ? 'grammar-edit-description' : undefined}
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-blue-700 dark:text-blue-300">編輯卡片</p>
            <h2 id="grammar-edit-title" className="mt-1 text-lg font-bold text-slate-900 dark:text-white sm:text-xl">
              {title}
            </h2>
            {description ? (
              <p id="grammar-edit-description" className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {description}
              </p>
            ) : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            關閉
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <InlineGrammarEditor
            draft={draft}
            onChange={onChange}
            onSave={onSave}
            onSaveAndNext={onSaveAndNext}
          />
        </div>
      </div>
    </div>
  );
}
