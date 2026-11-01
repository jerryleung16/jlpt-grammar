import { itemSchema, questionSchema, type LearningItem, type Question } from './model';

const common = {
  level: 'N5' as const, label: 'untagged' as const, source: 'preview' as const, note: '原創功能示範；尚非正式校對教材。',
};
const vocabulary = [
  ['water', '水', 'みず', '水', '水を一杯ください。', '請給我一杯水。'],
  ['station', '駅', 'えき', '車站', '駅で友達に会います。', '我要在車站見朋友。'],
  ['morning', '朝', 'あさ', '早晨', '朝はパンを食べます。', '我早上吃麵包。'],
  ['book', '本', 'ほん', '書', 'この本はおもしろいです。', '這本書很有趣。'],
];
const grammar = [
  ['want', '〜たい', '想要做某事', '動詞ます形去掉ます＋たい', '日本へ行きたいです。', '我想去日本。'],
  ['ongoing', '〜ています', '正在進行某個動作', '動詞て形＋います', '今、本を読んでいます。', '現在正在看書。'],
  ['negative', '〜ません', '動詞的禮貌否定形式', '動詞ます形去掉ます＋ません', '今日は学校へ行きません。', '今天不去學校。'],
  ['reason', '〜から', '表示原因：因為……', '普通形／禮貌形＋から', '雨ですから、家にいます。', '因為下雨，所以待在家裡。'],
];

export const previewItems: LearningItem[] = [
  ...vocabulary.map(([id, word, reading, meaning, example, translation]) =>
    itemSchema.parse({ ...common, id: `preview:${id}`, kind: 'vocabulary', word, reading, meaning, example, translation })),
  ...grammar.map(([id, pattern, meaning, connection, example, translation]) =>
    itemSchema.parse({ ...common, id: `preview:${id}`, kind: 'grammar', pattern, meaning, connection, example, translation })),
];

export const previewQuestions: Question[] = [
  { id: 'water', prompt: '「水を一杯ください」中的「水」讀音是？', options: ['みせ', 'みず', 'みち', 'みみ'], answer: 1, explanation: '水讀作「みず」。みせ是店、みち是道路、みみ是耳朵；它們不是水的讀音。' },
  { id: 'station', prompt: '「駅で友達に会います」中的「駅」是甚麼地方？', options: ['醫院', '公園', '車站', '圖書館'], answer: 2, explanation: '駅是車站，讀作えき。醫院是病院、公園是公園、圖書館是図書館。' },
  { id: 'morning', prompt: '「朝はパンを食べます」的「朝」指哪個時段？', options: ['早晨', '中午', '傍晚', '深夜'], answer: 0, explanation: '朝（あさ）是早晨；中午可用昼、傍晚可用夕方、深夜是深夜。' },
  { id: 'book', prompt: '「この本はおもしろいです」中的「本」讀音是？', options: ['はな', 'へや', 'ほし', 'ほん'], answer: 3, explanation: '表示書的本讀作ほん。はな是花／鼻、へや是房間、ほし是星星。' },
  { id: 'want', prompt: '選出「我想去日本」的說法：日本へ＿＿です。', options: ['行きたい', '行った', '行きます', '行って'], answer: 0, explanation: '行きたい表示想去，たい後可接です。行った表示過去，行きます已是禮貌形式，行って是て形，均不符合此句的意願與接續。' },
  { id: 'ongoing', prompt: '描述此刻正在看書：今、本を＿＿。', options: ['読みませんでした', '読んでいます', '読みたいです', '読みました'], answer: 1, explanation: '読んでいます表示動作正在進行。其餘分別表示過去沒看、想看、已看，不能表達題目要求的正在看。' },
  { id: 'negative', prompt: '選出「今天不去學校」：今日は学校へ＿＿。', options: ['行きました', '行っています', '行きません', '行きたいです'], answer: 2, explanation: '行きません是禮貌否定。行きました表示去了、行っています表示持續狀態、行きたいです表示想去，皆不等於不去。' },
  { id: 'reason', prompt: '表達原因「因為下雨，所以待在家裡」：雨です＿＿、家にいます。', options: ['まで', 'を', 'へ', 'から'], answer: 3, explanation: 'から接在雨です後表示原因。まで表示範圍終點、を標示受詞、へ標示方向，不能在此位置表達因果。' },
].map(({ id, ...question }) => questionSchema.parse({
  ...question, id: `question:${id}`, itemId: `preview:${id}`, version: 1,
}));
