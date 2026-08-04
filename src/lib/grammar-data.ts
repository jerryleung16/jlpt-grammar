export type DifficultyGroup = 'easy' | 'difficult';

export type GrammarCard = {
  id: string;
  level: string;
  pattern: string;
  meaning: string;
  connection: string;
  example: string;
  specialNote: string;
  frontText: string;
  backExplanation: string;
  difficultyGroup?: DifficultyGroup;
};

const DEFAULT_GRAMMAR_CARDS: GrammarCard[] = [
  {
    id: "n5-1",
    level: "N5",
    pattern: "〜ている",
    meaning: "正在進行的動作或目前狀態",
    connection: "V-て形 + いる",
    example: "彼は本を読んでいる。",
    specialNote: "描述持續進行中的動作，或目前的狀態。",
    frontText: "〜ている",
    backExplanation:
      "正在進行的動作或目前狀態。例句：彼は本を読んでいる。",
    difficultyGroup: 'easy',
  },
  {
    id: "n5-2",
    level: "N5",
    pattern: "〜たい",
    meaning: "想要做某事",
    connection: "V-ます形 → たい",
    example: "日本語を勉強したいです。",
    specialNote: "用來表達意願或希望。",
    frontText: "〜たい",
    backExplanation:
      "表達想要做某事。例句：日本語を勉強したいです。",
    difficultyGroup: 'easy',
  },
  {
    id: "n4-1",
    level: "N4",
    pattern: "〜ように",
    meaning: "為了……、依照……的方式",
    connection: "名詞 / 動詞連用形 + ように",
    example: "早く寝るようにしました。",
    specialNote: "可表示目標、方式或努力方向。",
    frontText: "〜ように",
    backExplanation:
      "表示目的或方式。例句：早く寝るようにしました。",
    difficultyGroup: 'easy',
  },
];

const STORAGE_KEY = 'jlpt-grammar-cards';

export function getStoredGrammarCards(): GrammarCard[] {
  if (typeof window === 'undefined') {
    return DEFAULT_GRAMMAR_CARDS;
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return DEFAULT_GRAMMAR_CARDS;
    }

    const parsed = JSON.parse(saved) as GrammarCard[];
    return parsed.length > 0 ? parsed : DEFAULT_GRAMMAR_CARDS;
  } catch {
    return DEFAULT_GRAMMAR_CARDS;
  }
}

export function saveGrammarCards(cards: GrammarCard[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  window.dispatchEvent(new CustomEvent('grammar-cards-updated'));
}

export function getDefaultGrammarCards(): GrammarCard[] {
  return DEFAULT_GRAMMAR_CARDS;
}
