import type { DifficultyGroup, GrammarCard, GrammarCardDraft } from '@/lib/grammar-data';

export const MAX_COPILOT_CONTEXT_LENGTH = 4000;
export const MAX_COPILOT_MESSAGE_LENGTH = 1000;

export type GrammarCardEditChanges = Partial<GrammarCardDraft> & {
  difficultyGroup?: DifficultyGroup | null;
};

export type GrammarMutationProposal =
  | {
      id: string;
      type: 'edit';
      cardId: string;
      changes: GrammarCardEditChanges;
    }
  | {
      id: string;
      type: 'create';
      card: GrammarCardDraft & { difficultyGroup?: DifficultyGroup };
    };

function bounded(value: unknown, length: number) {
  return String(value ?? '').slice(0, length);
}

export function serializeGrammarCardContext(card: GrammarCard): string {
  const context = {
    id: bounded(card.id, 100),
    level: bounded(card.level, 20),
    pattern: bounded(card.pattern, 200),
    meaning: bounded(card.meaning, 800),
    connection: bounded(card.connection, 800),
    example: bounded(card.example, 800),
    specialNote: bounded(card.specialNote, 800),
    difficultyGroup: card.difficultyGroup ?? null,
  };

  return JSON.stringify(context).slice(0, MAX_COPILOT_CONTEXT_LENGTH);
}

export function parseGrammarCardContext(context: string): GrammarCard | null {
  if (typeof context !== 'string' || context.length > MAX_COPILOT_CONTEXT_LENGTH) {
    return null;
  }

  try {
    const parsed = JSON.parse(context) as Partial<GrammarCard>;
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.level !== 'string' ||
      typeof parsed.pattern !== 'string' ||
      typeof parsed.meaning !== 'string' ||
      typeof parsed.connection !== 'string' ||
      typeof parsed.example !== 'string' ||
      typeof parsed.specialNote !== 'string'
    ) {
      return null;
    }

    return {
      id: parsed.id,
      level: parsed.level,
      pattern: parsed.pattern,
      meaning: parsed.meaning,
      connection: parsed.connection,
      example: parsed.example,
      specialNote: parsed.specialNote,
      frontText: parsed.pattern,
      backExplanation: `${parsed.meaning}｜${parsed.connection}｜${parsed.example}`,
      difficultyGroup: parsed.difficultyGroup,
    };
  } catch {
    return null;
  }
}

export function validateEditChanges(value: unknown): GrammarCardEditChanges | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const allowedFields = new Set([
    'level',
    'pattern',
    'meaning',
    'connection',
    'example',
    'specialNote',
    'difficultyGroup',
  ]);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedFields.has(key))) {
    return null;
  }

  const changes: GrammarCardEditChanges = {};
  for (const field of ['level', 'pattern', 'meaning', 'connection', 'example', 'specialNote'] as const) {
    if (field in record) {
      if (typeof record[field] !== 'string' || record[field].length > 1000) {
        return null;
      }
      changes[field] = record[field];
    }
  }

  if ('difficultyGroup' in record) {
    if (record.difficultyGroup !== null && record.difficultyGroup !== 'easy' && record.difficultyGroup !== 'difficult') {
      return null;
    }
    changes.difficultyGroup = record.difficultyGroup;
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

export function validateCreateCard(value: unknown): (GrammarCardDraft & { difficultyGroup?: DifficultyGroup }) | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const fields = ['level', 'pattern', 'meaning', 'connection', 'example', 'specialNote'] as const;
  if (fields.some((field) => typeof record[field] !== 'string' || record[field].length > 1000)) {
    return null;
  }

  if (
    record.difficultyGroup !== undefined &&
    record.difficultyGroup !== 'easy' &&
    record.difficultyGroup !== 'difficult'
  ) {
    return null;
  }

  return {
    level: record.level as string,
    pattern: record.pattern as string,
    meaning: record.meaning as string,
    connection: record.connection as string,
    example: record.example as string,
    specialNote: record.specialNote as string,
    ...(record.difficultyGroup ? { difficultyGroup: record.difficultyGroup } : {}),
  };
}