import { z } from 'zod';

export const levels = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const text = z.string().max(10000);
const id = z.string().min(1).max(300);
const timestamp = z.string().datetime();
export const labelSchema = z.enum(['untagged', 'easy', 'difficult']);
const common = {
  id,
  level: z.enum(levels).nullable(),
  meaning: text.min(1),
  example: text,
  translation: text,
  note: text,
  label: labelSchema,
  source: z.enum(['preview', 'custom', 'legacy-vocabulary', 'legacy-grammar']),
};

export const itemSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('vocabulary'), reading: text.min(1), word: text.min(1) }).strict(),
  z.object({ ...common, kind: z.literal('grammar'), pattern: text.min(1), connection: text }).strict(),
]);
export type LearningItem = z.infer<typeof itemSchema>;
export type Level = (typeof levels)[number];
export type Label = z.infer<typeof labelSchema>;

export const reviewSchema = z.object({
  id,
  itemId: id,
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  at: timestamp,
  undone: z.boolean(),
}).strict();
export type ReviewEvent = z.infer<typeof reviewSchema>;

export const questionSchema = z.object({
  id,
  itemId: id,
  version: z.literal(1),
  prompt: text.min(1),
  options: z.array(text.min(1)).length(4).refine((values) => new Set(values).size === 4, '選項不能重複'),
  answer: z.number().int().min(0).max(3),
  explanation: text.min(1),
}).strict();
export type Question = z.infer<typeof questionSchema>;
export const attemptSchema = z.object({
  id,
  startedAt: timestamp,
  questions: z.array(questionSchema).min(1).max(100),
  answers: z.array(z.number().int().min(0).max(3)),
}).strict().refine((value) => value.answers.length <= value.questions.length, '答案數量超出題目');
export type QuizAttempt = z.infer<typeof attemptSchema>;

export const settingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  level: z.enum(levels).nullable(),
  newPerDay: z.number().int().min(0).max(100),
  timeZone: z.string().max(100).refine((value) => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; }
    catch { return false; }
  }, '時區無效'),
}).strict();

export const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  schedulerVersion: z.literal('fsrs-6-preview-1'),
  items: z.array(itemSchema).max(50000),
  reviews: z.array(reviewSchema).max(500000),
  attempts: z.array(attemptSchema).max(10000),
  settings: settingsSchema,
}).strict().superRefine((value, context) => {
  for (const [name, records] of [
    ['items', value.items], ['reviews', value.reviews], ['attempts', value.attempts],
  ] as const) {
    if (new Set(records.map((record) => record.id)).size !== records.length) {
      context.addIssue({ code: 'custom', message: `${name} 有重複 ID` });
    }
  }
  const itemIds = new Set(value.items.map((item) => item.id));
  if (value.reviews.some((event) => !itemIds.has(event.itemId))) {
    context.addIssue({ code: 'custom', message: '複習紀錄缺少對應卡片' });
  }
  if (value.attempts.some((attempt) => attempt.questions.some((question) => !itemIds.has(question.itemId)))) {
    context.addIssue({ code: 'custom', message: '測驗紀錄缺少對應卡片' });
  }
});
export type LearningSnapshot = z.infer<typeof snapshotSchema>;

export function emptySnapshot(timeZone = 'Asia/Hong_Kong'): LearningSnapshot {
  return {
    schemaVersion: 1, schedulerVersion: 'fsrs-6-preview-1',
    items: [], reviews: [], attempts: [],
    settings: { level: 'N5', newPerDay: 10, timeZone, theme: 'system' },
  };
}

export function titleOf(item: LearningItem) {
  return item.kind === 'vocabulary' ? item.word : item.pattern;
}

export function parseSnapshot(value: unknown): LearningSnapshot {
  const result = snapshotSchema.safeParse(value);
  if (!result.success) throw new Error(`備份格式無效：${result.error.issues[0]?.message ?? '未知錯誤'}`);
  if (new TextEncoder().encode(JSON.stringify(result.data, null, 2)).byteLength > MAX_BACKUP_BYTES) {
    throw new Error('資料超出預覽版 20 MB 備份上限；本次變更未儲存，原有資料仍保留。');
  }
  return result.data;
}
