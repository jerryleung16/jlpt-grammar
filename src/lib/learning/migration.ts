import { z } from 'zod';
import { emptySnapshot, itemSchema, parseSnapshot, type LearningItem, type LearningSnapshot } from './model';

const legacyText = z.string().max(10000);
const legacyId = z.union([z.string().min(1).max(200), z.number().int().nonnegative()]);
const vocabularySchema = z.object({
  version: z.literal(1),
  customVocab: z.array(z.object({
    id: legacyId, hiragana: legacyText.min(1), kanji: legacyText.optional(),
    definition: legacyText.min(1), example: legacyText.optional(), translation: legacyText.optional(),
  })).max(50000),
  reviewStates: z.record(z.string(), z.enum(['known', 'dontknow', 'pending'])),
});
const grammarSchema = z.object({
  version: z.literal(1),
  cards: z.array(z.object({
    id: legacyId, level: z.enum(['N1', 'N2', 'N3', 'N4', 'N5']),
    pattern: legacyText.min(1), meaning: legacyText.min(1),
    connection: legacyText, example: legacyText, specialNote: legacyText,
    difficultyGroup: z.enum(['easy', 'difficult']).optional(),
  })).max(50000),
});

export function parseImport(value: unknown): LearningSnapshot {
  if (value && typeof value === 'object' && 'schemaVersion' in value) return parseSnapshot(value);
  const vocabulary = vocabularySchema.safeParse(value);
  if (vocabulary.success) {
    const { customVocab, reviewStates } = vocabulary.data;
    const items: LearningItem[] = customVocab.map((card) => ({
      id: `legacy-vocabulary:${card.id}`, kind: 'vocabulary', source: 'legacy-vocabulary', level: null,
      reading: card.hiragana, word: card.kanji || card.hiragana, meaning: card.definition,
      example: card.example ?? '', translation: card.translation ?? '', note: '',
      label: reviewStates[String(card.id)] === 'known' ? 'easy'
        : reviewStates[String(card.id)] === 'dontknow' ? 'difficult' : 'untagged',
    }));
    return parseSnapshot({ ...emptySnapshot(), items });
  }
  const grammar = grammarSchema.safeParse(value);
  if (grammar.success) {
    const items: LearningItem[] = grammar.data.cards.map((card) => ({
      id: `legacy-grammar:${card.id}`, kind: 'grammar', source: 'legacy-grammar', level: card.level,
      pattern: card.pattern, meaning: card.meaning, connection: card.connection,
      example: card.example, translation: '', note: card.specialNote, label: card.difficultyGroup ?? 'untagged',
    }));
    return parseSnapshot({ ...emptySnapshot(), items });
  }
  throw new Error('無法辨認備份，或卡片欄位無效。請選擇詞彙／文法 v1 同步檔或新平台備份；原有資料未修改。');
}

function sameItem(a: LearningItem, b: LearningItem) {
  return JSON.stringify(itemSchema.parse(a)) === JSON.stringify(itemSchema.parse(b));
}

export function importSummary(local: LearningSnapshot, incoming: LearningSnapshot) {
  const byId = new Map(local.items.map((item) => [item.id, item]));
  return incoming.items.reduce((counts, item) => {
    const existing = byId.get(item.id);
    if (!existing) counts.added++;
    else if (sameItem(existing, item)) counts.identical++;
    else counts.conflicts++;
    return counts;
  }, { added: 0, identical: 0, conflicts: 0 });
}

export function mergeImport(local: LearningSnapshot, incoming: LearningSnapshot): LearningSnapshot {
  if (importSummary(local, incoming).conflicts) {
    throw new Error('相同 ID 的內容不同，已中止匯入以保護兩份資料。請保留備份，先在來源整理衝突。');
  }
  function mergeById<T extends { id: string }>(current: T[], added: T[]): T[] {
    const records = new Map(current.map((record) => [record.id, record]));
    for (const record of added) {
      const previous = records.get(record.id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(record)) {
        throw new Error('學習紀錄版本衝突，未覆蓋本機資料。');
      }
      records.set(record.id, record);
    }
    return [...records.values()];
  }
  const items = new Map(local.items.map((item) => [item.id, item]));
  for (const item of incoming.items) items.set(item.id, item);
  return parseSnapshot({
    ...local,
    items: [...items.values()],
    reviews: mergeById(local.reviews, incoming.reviews),
    attempts: mergeById(local.attempts, incoming.attempts),
  });
}

export function readLegacyBrowser(storage: Pick<Storage, 'getItem'>): LearningSnapshot {
  const vocab = storage.getItem('japanese_custom_vocab');
  const grammar = storage.getItem('jlpt-grammar-cards');
  let result = emptySnapshot();
  if (vocab !== null) {
    result = mergeImport(result, parseImport({
      version: 1, customVocab: JSON.parse(vocab),
      reviewStates: JSON.parse(storage.getItem('japanese_vocab_review_states') ?? '{}'),
    }));
  }
  if (grammar !== null) result = mergeImport(result, parseImport({ version: 1, cards: JSON.parse(grammar) }));
  if (!result.items.length) throw new Error('此瀏覽器沒有可匯入的舊卡片。可從舊站下載同步檔再匯入。');
  return result;
}
