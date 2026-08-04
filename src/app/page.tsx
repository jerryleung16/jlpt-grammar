import Link from "next/link";
import AddGrammarForm from "@/components/grammar/AddGrammarForm";
import GrammarBank from "@/components/grammar/GrammarBank";

const pillars = [
  "公式化文法模式",
  "主動回憶練習",
  "適合滑動操作的複習流程",
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-slate-200 bg-white/80 p-8 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-blue-500">
          JLPT 文法公式化系統
        </p>
        <div className="mt-4 grid gap-8 lg:grid-cols-[1.3fr_0.9fr] lg:items-center">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white sm:text-5xl">
              用可重複的系統學習文法，而不是一堆零散筆記。
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300">
              這個入門版本將公開文法知識庫與專注式 SRS 複習模式結合，讓每個句型都能在即將遺忘前重新被複習。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/practice"
                className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                開啟練習模式
              </Link>
              <a
                href="#roadmap"
                className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                查看藍圖
              </a>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950 p-5 text-slate-100 shadow-xl">
            <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">
              核心支柱
            </h2>
            <ul className="mt-4 space-y-3">
              {pillars.map((pillar) => (
                <li
                  key={pillar}
                  className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm"
                >
                  {pillar}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <AddGrammarForm />
      <GrammarBank />

      <section id="roadmap" className="mt-6 grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">1. 內容</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            將文法點整理成具結構的頁面，並搭配可重用的注音、範例與等級資訊。
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">2. 複習</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            使用適合滑動操作的卡片循環，依照使用者自信度進行 FSRS 類型排程。
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">3. 擴充</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            未來可加入可搜尋的文法清單、牌組持久化，以及 Git 型 CMS 的內容編輯功能。
          </p>
        </article>
      </section>
    </main>
  );
}
