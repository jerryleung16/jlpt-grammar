import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptySnapshot, parseSnapshot, type LearningSnapshot, type ReviewEvent } from './model';
import { importSummary, mergeImport, parseImport, readLegacyBrowser } from './migration';
import { dueQueue, localDay, ratingPreviews, recordReview, scheduleItem } from './scheduler';
import { answerQuiz, createQuiz, scoreQuiz, wrongQuestions } from './quiz';
import { previewItems, previewQuestions } from './preview-content';
import { loadLearning, updateLearning } from './store';

const now = new Date('2026-11-01T04:00:00.000Z');
function snapshot(): LearningSnapshot {
  return { ...emptySnapshot(), items: structuredClone(previewItems) };
}
function review(overrides: Partial<ReviewEvent> = {}): ReviewEvent {
  return { id: 'review:1', itemId: previewItems[0].id, at: now.toISOString(), rating: 3, undone: false, ...overrides };
}
const oldVocab = {
  version: 1, exportedAt: now.toISOString(),
  customVocab: [{ id: 1000, hiragana: 'みず', kanji: '水', definition: '水', example: '水をください。', translation: '請給我水。' }],
  reviewStates: { '1000': 'known' },
};
const oldGrammar = {
  version: 1, cards: [{ id: 'n5-1', level: 'N5', pattern: '〜たい', meaning: '想要', connection: 'ます形＋たい',
    example: '行きたいです。', specialNote: '備註', difficultyGroup: 'difficult', frontText: '〜たい', backExplanation: '舊顯示' }],
};

test('legacy vocabulary retains every content field and label, but creates no invented reviews', () => {
  const result = parseImport(oldVocab);
  const item = result.items[0];
  assert.equal(item.kind, 'vocabulary');
  assert.equal(item.id, 'legacy-vocabulary:1000');
  assert.equal(item.level, null);
  assert.equal(item.label, 'easy');
  assert.equal(item.example, oldVocab.customVocab[0].example);
  assert.equal(item.translation, oldVocab.customVocab[0].translation);
  assert.equal(result.reviews.length, 0);
});

test('legacy grammar preserves levels, examples, notes and difficult labels', () => {
  const result = parseImport(oldGrammar);
  assert.equal(result.items[0].kind, 'grammar');
  assert.equal(result.items[0].label, 'difficult');
  assert.equal(result.items[0].level, 'N5');
  assert.equal(result.items[0].note, '備註');
  assert.equal(result.items[0].example, '行きたいです。');
});

test('all legacy vocabulary labels map correctly', () => {
  for (const [old, current] of [['pending', 'untagged'], ['known', 'easy'], ['dontknow', 'difficult']]) {
    assert.equal(parseImport({ ...oldVocab, reviewStates: { '1000': old } }).items[0].label, current);
  }
});

test('unknown versions, invalid entries, duplicate IDs and bad labels never silently become empty imports', () => {
  assert.throws(() => parseImport({ ...oldVocab, version: 9 }));
  assert.throws(() => parseImport({ ...oldVocab, reviewStates: { '1000': 'wrong' } }));
  assert.throws(() => parseImport({ ...oldVocab, customVocab: [...oldVocab.customVocab, ...oldVocab.customVocab] }));
  assert.throws(() => parseImport({ version: 1, cards: [{ id: 1 }] }));
});

test('reimport is idempotent; a different card with the same ID cannot overwrite data', () => {
  const imported = parseImport(oldVocab);
  assert.deepEqual(mergeImport(imported, imported), imported);
  const conflict = parseImport({ ...oldVocab, customVocab: [{ ...oldVocab.customVocab[0], definition: 'changed' }] });
  assert.deepEqual(importSummary(imported, conflict), { added: 0, identical: 0, conflicts: 1 });
  assert.throws(() => mergeImport(imported, conflict), /相同 ID/);
  assert.equal(imported.items[0].meaning, '水');
});

test('known storage keys only are read; credential and unrelated storage remain untouched', () => {
  const requested: string[] = [];
  const storage = {
    getItem(key: string) {
      requested.push(key);
      if (key === 'japanese_custom_vocab') return JSON.stringify(oldVocab.customVocab);
      if (key === 'japanese_vocab_review_states') return JSON.stringify(oldVocab.reviewStates);
      if (key === 'jlpt-grammar-cards') return JSON.stringify(oldGrammar.cards);
      throw new Error('Unexpected storage key');
    },
  };
  assert.equal(readLegacyBrowser(storage).items.length, 2);
  assert.deepEqual(requested.sort(), ['japanese_custom_vocab', 'japanese_vocab_review_states', 'jlpt-grammar-cards'].sort());
});

test('backups round-trip content, labels, attempts, settings and review events; secrets rejected', () => {
  const state = recordReview(snapshot(), review());
  state.settings.newPerDay = 4;
  state.attempts = [answerQuiz(createQuiz(previewQuestions, 3, 'quiz:1', now), 0, 2)];
  assert.deepEqual(parseSnapshot(JSON.parse(JSON.stringify(state))), state);
  assert.throws(() => parseSnapshot({ ...state, token: 'not-a-real-token' }));
  assert.throws(() => parseSnapshot({ ...state, reviews: [review({ itemId: 'missing' })] }));
});

test('stored data cannot grow beyond the backup import size limit', () => {
  const state = snapshot();
  state.items = Array.from({ length: 2500 }, (_, index) => ({
    ...previewItems[0], id: `large:${index}`, note: 'x'.repeat(10000),
  }));
  assert.throws(() => parseSnapshot(state), /20 MB/);
});

test('all four FSRS grades persist as serializable events and reconstruct real future schedules', () => {
  const initial = snapshot();
  const previews = ratingPreviews(previewItems[0].id, initial.reviews, now);
  for (const rating of [1, 2, 3, 4] as const) {
    const state = parseSnapshot(JSON.parse(JSON.stringify(recordReview(initial, review({ rating })))));
    const card = scheduleItem(previewItems[0].id, state.reviews, now);
    assert.equal(card.reps, 1);
    assert.ok(card.due > now);
    assert.ok(card.stability > 0);
    assert.equal(card.due.toISOString(), previews[rating].card.due.toISOString());
  }
});

test('duplicate operation IDs do not count twice; backwards device clocks rejected', () => {
  const state = recordReview(snapshot(), review());
  assert.equal(recordReview(state, review()).reviews.length, 1);
  assert.throws(() => recordReview(state, review({ id: 'second', at: '2026-10-31T04:00:00.000Z' })), /裝置時間/);
});

test('undo reconstructs an unreviewed card without erasing the historical event', () => {
  const event = review({ undone: true });
  const card = scheduleItem(event.itemId, [event], now);
  assert.equal(card.reps, 0);
  assert.equal(card.due.toISOString(), now.toISOString());
});

test('daily new-card limit never hides due cards; manual known label does not suppress SRS', () => {
  const state = snapshot();
  state.settings.newPerDay = 1;
  state.items[0].label = 'easy';
  assert.equal(dueQueue(state, now).length, 1);
  const learned = recordReview(state, review({ rating: 1 }));
  const due = scheduleItem(previewItems[0].id, learned.reviews, now).due;
  assert.equal(dueQueue(learned, now).length, 0);
  assert.equal(dueQueue(learned, due).length, 1);
  assert.equal(dueQueue(learned, due)[0].id, previewItems[0].id);
  learned.settings.newPerDay = 0;
  assert.equal(dueQueue(learned, due).length, 1);
});

test('daily boundaries use the configured timezone, including daylight-saving transitions', () => {
  assert.notEqual(localDay(new Date('2026-11-01T15:59:00Z'), 'Asia/Hong_Kong'), localDay(new Date('2026-11-01T16:00:00Z'), 'Asia/Hong_Kong'));
  assert.equal(localDay(new Date('2026-11-01T05:30:00Z'), 'America/New_York'), localDay(new Date('2026-11-01T06:30:00Z'), 'America/New_York'));
  assert.throws(() => parseSnapshot({ ...snapshot(), settings: { ...snapshot().settings, timeZone: 'not-a-timezone' } }));
});

test('quiz returns actual available count rather than padding to ten; no duplicate questions', () => {
  const attempt = createQuiz(previewQuestions, 10, 'quiz:1', now);
  assert.equal(attempt.questions.length, 8);
  assert.equal(new Set(attempt.questions.map((question) => question.id)).size, 8);
  assert.throws(() => createQuiz([], 10, 'quiz:2', now));
  assert.throws(() => createQuiz(previewQuestions, 0, 'quiz:2', now));
  assert.throws(() => createQuiz(previewQuestions, 1.5, 'quiz:2', now));
  assert.throws(() => createQuiz([...previewQuestions, previewQuestions[0]], 10, 'quiz:2', now));
});

test('invalid options, duplicate answers, indices outside 0–3 and repeated submission are rejected', () => {
  assert.throws(() => createQuiz([{ ...previewQuestions[0], options: ['x', 'x', 'y', 'z'] }], 1, 'q', now));
  let attempt = createQuiz(previewQuestions, 1, 'quiz:1', now);
  assert.throws(() => answerQuiz(attempt, 0, 4));
  attempt = answerQuiz(attempt, 0, 0);
  assert.throws(() => answerQuiz(attempt, 0, 0));
});

test('quiz progress persists; scoring and retrying wrong answers leave SRS and labels unchanged', () => {
  const state = snapshot();
  const attempt = createQuiz([previewQuestions[0]], 1, 'quiz:1', now);
  const wrong = answerQuiz(attempt, 0, (attempt.questions[0].answer + 1) % 4);
  assert.equal(scoreQuiz(wrong), 0);
  assert.equal(wrongQuestions([wrong]).length, 1);
  const retry = answerQuiz(createQuiz(wrongQuestions([wrong]), 1, 'quiz:2', new Date(now.getTime() + 1000)), 0, attempt.questions[0].answer);
  state.attempts = [wrong, retry];
  const restored = parseSnapshot(JSON.parse(JSON.stringify(state)));
  assert.equal(wrongQuestions(restored.attempts).length, 0);
  assert.equal(scoreQuiz(restored.attempts[1]), 1);
  assert.deepEqual(restored.reviews, []);
  assert.equal(restored.items[0].label, 'untagged');
});

test('IndexedDB transactions serialize concurrent writes and roll back validation failures', async () => {
  await updateLearning(() => snapshot());
  await Promise.all([
    updateLearning((current) => recordReview(current, review({ id: 'db:1' }))),
    updateLearning((current) => recordReview(current, review({ id: 'db:2', itemId: previewItems[1].id }))),
  ]);
  assert.equal((await loadLearning()).reviews.length, 2);
  await assert.rejects(updateLearning((current) => ({ ...current, items: [] })));
  assert.equal((await loadLearning()).items.length, 8);
  assert.equal((await loadLearning()).reviews.length, 2);
});
