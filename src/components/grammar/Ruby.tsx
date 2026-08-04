type RubyProps = {
  kanji: string;
  kana: string;
};

export default function Ruby({ kanji, kana }: RubyProps) {
  return (
    <ruby className="text-xl font-medium tracking-widest text-slate-900 dark:text-slate-100">
      {kanji}
      <rt className="text-xs text-slate-500">{kana}</rt>
    </ruby>
  );
}
